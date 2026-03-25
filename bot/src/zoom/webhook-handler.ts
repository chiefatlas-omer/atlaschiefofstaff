import { processTranscript } from '../ai/transcript-processor';
import { createTask } from '../tasks/task-service';
import { meetingSummaryBlocks, meetingSummaryDmBlocks } from '../slack/blocks';
import { config } from '../config';
import { db } from '../db/connection';
import { zoomUserMappings } from '../db/schema';
import { extractParticipantsFromVtt } from './transcript-fetcher';

type MeetingType = 'private' | 'external' | 'team';

const LEADERSHIP_IDS = new Set(
  [config.escalation.omerSlackUserId, config.escalation.markSlackUserId, config.escalation.ehsanSlackUserId].filter(Boolean)
);

// Cache Slack users list (refreshes every hour)
let slackUsersCache: any[] = [];
let slackUsersCacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Track processed meeting UUIDs to prevent duplicate processing
const processedMeetings = new Map<string, number>();
const DEDUP_TTL = 10 * 60 * 1000; // 10 minutes

async function getSlackUsers(slackClient: any): Promise<any[]> {
  const now = Date.now();
  if (slackUsersCache.length > 0 && now - slackUsersCacheTime < CACHE_TTL) {
    return slackUsersCache;
  }

  try {
    const result = await slackClient.users.list();
    slackUsersCache = (result.members || []).filter(
      (u: any) => !u.is_bot && !u.deleted && u.id !== 'USLACKBOT'
    );
    slackUsersCacheTime = now;
    console.log('Cached', slackUsersCache.length, 'Slack users for auto-mapping');
  } catch (err) {
    console.error('Failed to fetch Slack users list:', err);
  }

  return slackUsersCache;
}

// Download a file from a URL, trying various auth methods
async function downloadWithAuth(url: string, token: string, label: string): Promise<{ ok: boolean; text: string; status: number }> {
  // Try Authorization: Bearer header
  const response = await fetch(url, {
    headers: { Authorization: 'Bearer ' + token },
    redirect: 'follow',
  });
  const text = await response.text();
  console.log(label + ' status:', response.status, '- first 100 chars:', text.substring(0, 100));
  const isError = text.startsWith('{') && (text.includes('errorCode') || text.includes('error'));
  return { ok: response.ok && !isError, text, status: response.status };
}

// Fetch transcript from Zoom - tries multiple approaches
// 1. Webhook download_token (provided in webhook payload, valid 24h)
// 2. Recordings API to get fresh download URL + OAuth token
// 3. Direct OAuth token on webhook URL (last resort)
async function fetchZoomTranscript(
  downloadUrl: string,
  oauthToken: string,
  webhookDownloadToken?: string,
  meetingId?: string,
): Promise<string> {
  // Approach 1: Use webhook's download_token (the intended method)
  if (webhookDownloadToken) {
    console.log('Trying download with webhook download_token...');
    const result = await downloadWithAuth(downloadUrl, webhookDownloadToken, 'Webhook download_token');
    if (result.ok) return result.text;
    console.log('Webhook download_token failed, trying Recordings API...');
  }

  // Approach 2: Get transcript URL from Recordings API (uses OAuth token)
  if (meetingId) {
    try {
      console.log('Fetching recording files from Recordings API for meeting:', meetingId);
      const encodedId = encodeURIComponent(encodeURIComponent(meetingId));
      const apiUrl = 'https://api.zoom.us/v2/meetings/' + encodedId + '/recordings';
      const apiResponse = await fetch(apiUrl, {
        headers: { Authorization: 'Bearer ' + oauthToken },
      });
      if (apiResponse.ok) {
        const apiData = await apiResponse.json() as any;
        const transcriptFile = apiData.recording_files?.find(
          (f: any) => f.recording_type === 'audio_transcript' || f.file_type === 'TRANSCRIPT'
        );
        if (transcriptFile?.download_url) {
          console.log('Got transcript URL from Recordings API, downloading...');
          // API-sourced URLs work with OAuth token as query param
          const separator = transcriptFile.download_url.includes('?') ? '&' : '?';
          const apiDownloadUrl = transcriptFile.download_url + separator + 'access_token=' + oauthToken;
          const apiDlResponse = await fetch(apiDownloadUrl, { redirect: 'follow' });
          const apiText = await apiDlResponse.text();
          console.log('Recordings API download status:', apiDlResponse.status, '- first 100 chars:', apiText.substring(0, 100));
          const isError = apiText.startsWith('{') && (apiText.includes('errorCode') || apiText.includes('error'));
          if (apiDlResponse.ok && !isError) return apiText;
          console.log('Recordings API download failed, trying Bearer header on API URL...');

          // Try Bearer header on API-sourced URL
          const bearerResult = await downloadWithAuth(transcriptFile.download_url, oauthToken, 'Recordings API Bearer');
          if (bearerResult.ok) return bearerResult.text;
        } else {
          console.log('No transcript file found in Recordings API response');
        }
      } else {
        const errText = await apiResponse.text();
        console.log('Recordings API call failed:', apiResponse.status, errText.substring(0, 200));
      }
    } catch (err) {
      console.error('Recordings API fallback error:', err);
    }
  }

  // Approach 3: Try OAuth token directly on webhook URL (last resort)
  console.log('Trying OAuth token on webhook download URL as last resort...');
  const separator = downloadUrl.includes('?') ? '&' : '?';
  const urlWithToken = downloadUrl + separator + 'access_token=' + oauthToken;
  const lastResponse = await fetch(urlWithToken, { redirect: 'follow' });
  const lastText = await lastResponse.text();
  console.log('OAuth query param status:', lastResponse.status, '- first 100 chars:', lastText.substring(0, 100));

  if (lastText.startsWith('{') && (lastText.includes('errorCode') || lastText.includes('error'))) {
    console.error('All transcript download methods failed');
    throw new Error('Zoom transcript download failed after all attempts: ' + lastText);
  }

  return lastText;
}

// Get Zoom access token using Server-to-Server OAuth
async function getZoomAccessToken(): Promise<string> {
  const credentials = Buffer.from(
    config.zoom.clientId + ':' + config.zoom.clientSecret
  ).toString('base64');

  const response = await fetch('https://zoom.us/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + credentials,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=account_credentials&account_id=' + config.zoom.accountId,
  });

  const data = await response.json() as any;
  if (!data.access_token) {
    console.error('Failed to get Zoom OAuth token:', JSON.stringify(data).substring(0, 300));
    throw new Error('Failed to get Zoom access token: ' + (data.reason || data.error || 'unknown'));
  }
  console.log('Got Zoom OAuth token (expires in', data.expires_in, 'seconds)');
  return data.access_token;
}

// Resolve Zoom meeting host to a Slack user
// Tries: 1) Zoom API to get host name, then match against Slack users by first name
async function resolveHostToSlack(
  recording: any,
  accessToken: string,
  slackClient: any,
): Promise<{ name: string; slackId: string } | null> {
  let hostName = '';
  let hostEmail = recording.host_email || '';

  // Try to get host details from Zoom API
  if (recording.host_id) {
    try {
      const response = await fetch('https://api.zoom.us/v2/users/' + recording.host_id, {
        headers: { Authorization: 'Bearer ' + accessToken },
      });
      const userData = await response.json() as any;
      hostName = ((userData.first_name || '') + ' ' + (userData.last_name || '')).trim();
      hostEmail = hostEmail || userData.email || '';
      console.log('Zoom host info:', hostName, hostEmail);
    } catch (err) {
      console.error('Failed to fetch Zoom host info:', err);
    }
  }

  // If we couldn't get name from API, try extracting from meeting topic
  // "Omer J.'s Personal Meeting Room" -> "Omer J."
  if (!hostName && recording.topic) {
    const topicMatch = recording.topic.match(/^(.+?)(?:'s\s)/i);
    if (topicMatch) {
      hostName = topicMatch[1].trim();
      console.log('Extracted host name from topic:', hostName);
    }
  }

  if (!hostName && !hostEmail) return null;

  // Try to match against Slack users
  const slackUsers = await getSlackUsers(slackClient);
  if (slackUsers.length === 0) return null;

  const hostFirstName = (hostName || hostEmail.split('@')[0]).toLowerCase().split(' ')[0];
  console.log('Looking up Slack user by first name:', hostFirstName);

  // Try exact full name match first
  if (hostName) {
    const hostNameLower = hostName.toLowerCase();
    const exactMatch = slackUsers.find((u: any) => {
      const realName = (u.real_name || u.profile?.real_name || '').toLowerCase().trim();
      return realName === hostNameLower || realName.startsWith(hostNameLower) || hostNameLower.startsWith(realName);
    });
    if (exactMatch) {
      const name = exactMatch.real_name || exactMatch.profile?.real_name || exactMatch.name;
      console.log('Resolved host via name match:', name, '(' + exactMatch.id + ')');
      return { name, slackId: exactMatch.id };
    }
  }

  // Try unique first name match
  const firstNameMatches = slackUsers.filter((u: any) => {
    const realName = (u.real_name || u.profile?.real_name || '').toLowerCase().trim();
    const slackFirstName = realName.split(' ')[0];
    return slackFirstName === hostFirstName && hostFirstName.length > 1;
  });

  if (firstNameMatches.length === 1) {
    const match = firstNameMatches[0];
    const name = match.real_name || match.profile?.real_name || match.name;
    console.log('Resolved host via first-name match:', name, '(' + match.id + ')');
    return { name, slackId: match.id };
  }

  // Try lookupByEmail as last resort (may fail without users:read.email scope)
  if (hostEmail) {
    try {
      const slackUser = await slackClient.users.lookupByEmail({ email: hostEmail });
      if (slackUser.user) {
        const name = slackUser.user.real_name || slackUser.user.profile?.real_name || slackUser.user.name;
        console.log('Resolved host via email lookup:', name, '(' + slackUser.user.id + ')');
        return { name, slackId: slackUser.user.id };
      }
    } catch {
      // Expected to fail without users:read.email scope
    }
  }

  console.log('Could not resolve host:', hostName || hostEmail);
  return null;
}

// Get manual participant name to Slack user ID mapping
function getManualMapping(): Record<string, string> {
  const mappings = db.select().from(zoomUserMappings).all();
  const result: Record<string, string> = {};
  for (const m of mappings) {
    result[m.zoomDisplayName] = m.slackUserId;
  }
  return result;
}

// Auto-resolve Zoom participant names to Slack user IDs
async function resolveParticipants(
  participantNames: string[],
  slackClient: any,
): Promise<Record<string, string>> {
  // Start with manual mappings (these always win)
  const resolved = getManualMapping();

  // Find unmapped names
  const unmapped = participantNames.filter((name) => !resolved[name]);
  if (unmapped.length === 0) return resolved;

  // Fetch Slack users for auto-matching
  const slackUsers = await getSlackUsers(slackClient);
  if (slackUsers.length === 0) return resolved;

  for (const zoomName of unmapped) {
    const zoomNameLower = zoomName.toLowerCase().trim();
    const zoomFirstName = zoomNameLower.split(' ')[0];

    // 1. Try exact full name match
    let match = slackUsers.find((u: any) => {
      const realName = (u.real_name || u.profile?.real_name || '').toLowerCase().trim();
      const displayName = (u.profile?.display_name || '').toLowerCase().trim();
      return realName === zoomNameLower || displayName === zoomNameLower;
    });

    // 2. Try first + last name match (handles "Noah Malcolm" vs "Noah Malcolm Smith")
    if (!match && zoomName.includes(' ')) {
      match = slackUsers.find((u: any) => {
        const realName = (u.real_name || u.profile?.real_name || '').toLowerCase().trim();
        return realName.startsWith(zoomNameLower) || zoomNameLower.startsWith(realName);
      });
    }

    // 3. Try unique first name match (only if exactly one person has that first name)
    if (!match) {
      const firstNameMatches = slackUsers.filter((u: any) => {
        const realName = (u.real_name || u.profile?.real_name || '').toLowerCase().trim();
        const slackFirstName = realName.split(' ')[0];
        return slackFirstName === zoomFirstName && zoomFirstName.length > 1;
      });
      if (firstNameMatches.length === 1) {
        match = firstNameMatches[0];
      }
    }

    if (match) {
      resolved[zoomName] = match.id;

      // Save to database for instant future lookups
      try {
        db.insert(zoomUserMappings).values({
          zoomDisplayName: zoomName,
          slackUserId: match.id,
          createdAt: new Date(),
        }).run();
        console.log('Auto-mapped Zoom user:', zoomName, '->', match.real_name || match.profile?.real_name, '(' + match.id + ')');
      } catch {
        // Mapping may already exist, that's fine
      }
    } else {
      console.log('Could not auto-map Zoom user:', zoomName, '- no matching Slack user found');
    }
  }

  return resolved;
}

// Classify meeting type based on participants and topic
function classifyMeeting(
  participantNames: string[],
  participantMapping: Record<string, string>,
  meetingTopic?: string,
): { type: MeetingType; internalSlackIds: string[]; externalNames: string[] } {
  const internalSlackIds: string[] = [];
  const externalNames: string[] = [];

  for (const name of participantNames) {
    const slackId = participantMapping[name];
    if (slackId) {
      internalSlackIds.push(slackId);
    } else {
      externalNames.push(name);
    }
  }

  // Personal meeting rooms are ALWAYS private (regardless of participants)
  if (meetingTopic && /personal meeting room/i.test(meetingTopic)) {
    console.log('Personal meeting room detected, classifying as private');
    return { type: 'private', internalSlackIds, externalNames };
  }

  // Demo calls, sales calls, and 1:1 external meetings are ALWAYS private
  if (meetingTopic && /(demo|sales call|discovery|prospect|onboarding call)/i.test(meetingTopic)) {
    console.log('Sales/demo call detected from topic, classifying as private');
    return { type: 'private', internalSlackIds, externalNames };
  }

  // If there are unknown participants (no Zoom-to-Slack mapping) -> external
  if (externalNames.length > 0) {
    return { type: 'external', internalSlackIds, externalNames };
  }

  // If no internal participants identified at all -> treat as private
  if (internalSlackIds.length === 0) {
    return { type: 'private', internalSlackIds, externalNames };
  }

  // If ALL participants are leadership -> private
  const allLeadership = internalSlackIds.every((id) => LEADERSHIP_IDS.has(id));
  if (allLeadership) {
    return { type: 'private', internalSlackIds, externalNames };
  }

  // Small meetings (2-3 people) -> private (DM is more appropriate than public channel)
  if (internalSlackIds.length <= 3) {
    console.log('Small meeting (' + internalSlackIds.length + ' people), classifying as private');
    return { type: 'private', internalSlackIds, externalNames };
  }

  // Otherwise -> team meeting (4+ internal participants)
  return { type: 'team', internalSlackIds, externalNames };
}

export async function handleZoomWebhook(payload: any, slackClient: any) {
  // Handle recording.completed and recording.transcript_completed events
  if (payload.event !== 'recording.completed' && payload.event !== 'recording.transcript_completed') {
    console.log('Ignoring Zoom event:', payload.event);
    return;
  }
  console.log('Processing Zoom event:', payload.event);

  const recording = payload.payload?.object;
  if (!recording) return;

  // Dedup: skip if we already processed this meeting UUID recently
  const meetingKey = recording.uuid + ':' + payload.event;
  const lastProcessed = processedMeetings.get(meetingKey);
  if (lastProcessed && Date.now() - lastProcessed < DEDUP_TTL) {
    console.log('Skipping duplicate webhook for:', meetingKey);
    return;
  }
  processedMeetings.set(meetingKey, Date.now());

  // Clean up old entries periodically
  if (processedMeetings.size > 100) {
    const now = Date.now();
    for (const [key, ts] of processedMeetings) {
      if (now - ts > DEDUP_TTL) processedMeetings.delete(key);
    }
  }

  // Find the transcript file
  const transcriptFile = recording.recording_files?.find(
    (f: any) => f.recording_type === 'audio_transcript' || f.file_type === 'TRANSCRIPT'
  );

  if (!transcriptFile?.download_url) {
    console.log('No transcript found for meeting:', recording.id);
    return;
  }

  try {
    // Extract download_token from webhook payload (Zoom provides this for downloading)
    const webhookDownloadToken = payload.download_token;
    console.log('Webhook download_token present:', !!webhookDownloadToken);

    // Meeting UUID for Recordings API fallback
    const meetingUuid = recording.uuid;
    console.log('Meeting UUID:', meetingUuid, '- Meeting ID:', recording.id);

    let transcriptText: string | null = null;
    let accessToken: string | null = null;

    // Step 1: Try download_token first (doesn't need OAuth)
    if (webhookDownloadToken) {
      console.log('Trying download with webhook download_token...');
      const result = await downloadWithAuth(transcriptFile.download_url, webhookDownloadToken, 'Webhook download_token');
      if (result.ok) {
        transcriptText = result.text;
        console.log('Successfully downloaded transcript with webhook download_token!');
      } else {
        console.log('Webhook download_token failed, will try OAuth fallbacks...');
      }
    }

    // Step 2: If download_token didn't work, try OAuth-based approaches
    if (!transcriptText) {
      try {
        accessToken = await getZoomAccessToken();
      } catch (oauthErr) {
        console.error('OAuth token failed:', oauthErr);
        // If we have no download_token and no OAuth token, we can't proceed
        if (!webhookDownloadToken) {
          throw new Error('Cannot download transcript: no download_token and OAuth failed');
        }
      }

      if (accessToken) {
        // Try Recordings API with OAuth token
        const meetingIdForApi = meetingUuid || recording.id?.toString();
        if (meetingIdForApi) {
          try {
            console.log('Fetching recording files from Recordings API for meeting:', meetingIdForApi);
            const encodedId = encodeURIComponent(encodeURIComponent(meetingIdForApi));
            const apiUrl = 'https://api.zoom.us/v2/meetings/' + encodedId + '/recordings';
            const apiResponse = await fetch(apiUrl, {
              headers: { Authorization: 'Bearer ' + accessToken },
            });
            if (apiResponse.ok) {
              const apiData = await apiResponse.json() as any;
              const apiTranscriptFile = apiData.recording_files?.find(
                (f: any) => f.recording_type === 'audio_transcript' || f.file_type === 'TRANSCRIPT'
              );
              if (apiTranscriptFile?.download_url) {
                console.log('Got transcript URL from Recordings API, downloading...');
                const separator = apiTranscriptFile.download_url.includes('?') ? '&' : '?';
                const apiDownloadUrl = apiTranscriptFile.download_url + separator + 'access_token=' + accessToken;
                const apiDlResponse = await fetch(apiDownloadUrl, { redirect: 'follow' });
                const apiText = await apiDlResponse.text();
                console.log('Recordings API download status:', apiDlResponse.status, '- first 100 chars:', apiText.substring(0, 100));
                const isError = apiText.startsWith('{') && (apiText.includes('errorCode') || apiText.includes('error'));
                if (apiDlResponse.ok && !isError) {
                  transcriptText = apiText;
                  console.log('Successfully downloaded transcript via Recordings API!');
                }
              } else {
                console.log('No transcript file found in Recordings API response');
              }
            } else {
              const errText = await apiResponse.text();
              console.log('Recordings API call failed:', apiResponse.status, errText.substring(0, 200));
            }
          } catch (apiErr) {
            console.error('Recordings API fallback error:', apiErr);
          }
        }

        // Try OAuth token directly on webhook download URL as last resort
        if (!transcriptText) {
          console.log('Trying OAuth token on webhook download URL as last resort...');
          const bearerResult = await downloadWithAuth(transcriptFile.download_url, accessToken, 'OAuth Bearer');
          if (bearerResult.ok) {
            transcriptText = bearerResult.text;
          }
        }
      }
    }

    if (!transcriptText) {
      throw new Error('All transcript download methods failed for meeting: ' + recording.id);
    }

    // Log raw VTT for debugging
    console.log('Raw VTT content (first 500 chars):', transcriptText.substring(0, 500));

    // Get OAuth token for host resolution if we don't have one yet
    if (!accessToken) {
      try {
        accessToken = await getZoomAccessToken();
      } catch {
        console.log('OAuth unavailable for host resolution, will use topic-based matching');
      }
    }

    // Resolve the host ONCE upfront (reuse throughout)
    const host = await resolveHostToSlack(recording, accessToken || '', slackClient);
    console.log('Host lookup result:', host ? host.name + ' (' + host.slackId + ')' : 'not resolved');

    // Extract participant names from VTT transcript
    let participantNames = extractParticipantsFromVtt(transcriptText);
    console.log('Detected meeting participants from VTT:', participantNames);

    // If VTT parsing found no speakers (common in solo meetings), use host as fallback
    if (participantNames.length === 0 && host) {
      participantNames = [host.name];
      console.log('No VTT speakers, using host as participant:', host.name);
    }

    // Auto-resolve participants to Slack users
    const participantMapping = await resolveParticipants(participantNames, slackClient);

    // Ensure host is in the mapping (resolveParticipants might not match the real_name exactly)
    if (host) {
      // If host name is directly in participants, map it
      if (participantNames.includes(host.name) && !participantMapping[host.name]) {
        participantMapping[host.name] = host.slackId;
        console.log('Direct-mapped host name:', host.name, '->', host.slackId);
      }
      // If there are unmapped participants, map the first one to host
      for (const pName of participantNames) {
        if (!participantMapping[pName]) {
          participantMapping[pName] = host.slackId;
          console.log('Fallback-mapped participant to host:', pName, '->', host.slackId);
          break;
        }
      }
    }

    console.log('Resolved participant mapping:', participantMapping);

    // Classify the meeting
    const meetingTopic = recording.topic || 'Zoom Meeting';
    const meetingInfo = classifyMeeting(participantNames, participantMapping, meetingTopic);
    console.log('Meeting classified as:', meetingInfo.type, '- Topic:', meetingTopic);

    // If no participants identified at all, DM the host or fall back to leadership
    if (meetingInfo.internalSlackIds.length === 0 && meetingInfo.type === 'private') {
      if (host) {
        meetingInfo.internalSlackIds.push(host.slackId);
      } else {
        // Last resort: DM leadership
        const leaderIds = [config.escalation.omerSlackUserId, config.escalation.markSlackUserId].filter(Boolean);
        meetingInfo.internalSlackIds.push(...leaderIds);
        console.log('No participants identified, falling back to leadership DM');
      }
    }

    // Process transcript with Claude
    // If we know the host, tell Claude so it can attribute "I will..." statements
    const hostContext = host ? { hostName: host.name } : undefined;
    const result = await processTranscript(transcriptText, participantMapping, hostContext);

    if (meetingInfo.type === 'team') {
      // TEAM MEETING: Post to #founderhubhq (public)
      await handleTeamMeeting(result, meetingInfo, meetingTopic, recording, participantMapping, slackClient);
    } else {
      // PRIVATE or EXTERNAL: DM to internal participants only
      await handlePrivateMeeting(result, meetingInfo, meetingTopic, recording, participantMapping, slackClient);
    }

    console.log(
      'Processed Zoom transcript for', meetingInfo.type, 'meeting:',
      meetingTopic,
      '- Found', result.action_items.length, 'action items',
    );
  } catch (error) {
    console.error('Error processing Zoom webhook:', error);
  }
}

// Handle team meetings: post to channel + create tasks
async function handleTeamMeeting(
  result: any,
  meetingInfo: { type: MeetingType; internalSlackIds: string[]; externalNames: string[] },
  meetingTopic: string,
  recording: any,
  participantMapping: Record<string, string>,
  slackClient: any,
) {
  const targetChannel =
    config.channels.founderHubHQ ||
    config.channels.teamA ||
    config.channels.teamB;

  if (!targetChannel) {
    console.log('No target channel configured for meeting summaries');
    return;
  }

  // Post meeting summary to channel
  const blocks = meetingSummaryBlocks(
    result.summary,
    result.action_items,
    result.decisions,
    result.open_questions,
  );

  await slackClient.chat.postMessage({
    channel: targetChannel,
    text: ':clipboard: Meeting summary: ' + meetingTopic,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'Meeting Summary: ' + meetingTopic },
      },
      ...blocks,
    ],
  });

  // Create tasks for each action item with a known owner
  for (const item of result.action_items) {
    const slackUserId = participantMapping[item.owner_name];
    if (slackUserId) {
      createTask({
        slackUserId,
        slackUserName: item.owner_name,
        description: item.action,
        sourceChannelId: targetChannel,
        sourceMessageTs: Date.now().toString(),
        confidence: 'high',
        deadlineText: item.deadline_text,
        source: 'zoom',
        zoomMeetingId: recording.id?.toString(),
      });
    }
  }
}

// Handle private/external meetings: DM to internal participants + assignment buttons
async function handlePrivateMeeting(
  result: any,
  meetingInfo: { type: MeetingType; internalSlackIds: string[]; externalNames: string[] },
  meetingTopic: string,
  recording: any,
  participantMapping: Record<string, string>,
  slackClient: any,
) {
  const typeLabel = meetingInfo.type === 'external' ? 'External' : 'Private';

  // Build the meeting data to embed in button values
  const meetingId = recording.id?.toString() || Date.now().toString();

  // DM each internal participant
  for (const slackUserId of meetingInfo.internalSlackIds) {
    try {
      // Open a DM channel
      const dmResult = await slackClient.conversations.open({ users: slackUserId });
      const dmChannel = dmResult.channel?.id;
      if (!dmChannel) continue;

      // Build blocks with assignment capability
      const blocks = meetingSummaryDmBlocks(
        meetingTopic,
        typeLabel,
        result.summary,
        result.action_items,
        result.decisions,
        result.open_questions,
        meetingInfo.externalNames,
        meetingId,
      );

      await slackClient.chat.postMessage({
        channel: dmChannel,
        text: ':lock: ' + typeLabel + ' meeting summary: ' + meetingTopic,
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: typeLabel + ' Meeting: ' + meetingTopic },
          },
          ...blocks,
        ],
      });
    } catch (err) {
      console.error('Failed to DM user', slackUserId, 'meeting summary:', err);
    }
  }

  // Auto-create tasks for action items where the owner is a known internal user
  for (const item of result.action_items) {
    const slackUserId = participantMapping[item.owner_name];
    if (slackUserId) {
      createTask({
        slackUserId,
        slackUserName: item.owner_name,
        description: item.action,
        sourceChannelId: 'DM',
        sourceMessageTs: Date.now().toString(),
        confidence: 'high',
        deadlineText: item.deadline_text,
        source: 'zoom',
        zoomMeetingId: meetingId,
      });
    }
  }
}
