import React, { useEffect, useState } from 'react';
import { api, TeamMember, EscalationTarget, SlackUser } from '../lib/api';
import { useAuth } from '../lib/auth';

const ROLE_OPTIONS = [
  { value: '', label: 'Auto-detect', description: 'Detected from call patterns' },
  { value: 'sales', label: 'Sales', description: 'Sales coaching methodology' },
  { value: 'cs', label: 'Customer Success', description: 'CS coaching methodology' },
  { value: 'na', label: 'N/A', description: 'No coaching (e.g. operations, Team B)' },
];

const TEAM_OPTIONS = [
  { value: 'team_a', label: 'Team A' },
  { value: 'team_b', label: 'Team B' },
];

const ESCALATION_ROLE_OPTIONS = [
  { value: 'owner', label: 'Owner' },
  { value: 'manager', label: 'Manager' },
];

const NOTIFICATION_SCHEDULE = [
  { time: '8:00 AM', days: 'Mon–Fri', name: 'Task Reminders', recipients: 'Each person (DM)', color: 'blue' },
  { time: '8:05 AM', days: 'Mon–Fri', name: 'Morning Briefing', recipients: 'Each team member', color: 'blue' },
  { time: '8:30 AM', days: 'Mon–Fri', name: 'Proactive Alerts', recipients: 'Leadership', color: 'purple' },
  { time: '9:00 AM', days: 'Mon–Fri', name: 'Escalation Check', recipients: 'Leadership', color: 'red' },
  { time: '9:15 AM', days: 'Fridays', name: 'Weekly Digest', recipients: 'All channels + DMs', color: 'purple' },
  { time: '9:15 AM', days: 'Mondays', name: 'Coaching Summary', recipients: 'Reps + Leadership', color: 'emerald' },
  { time: '10:00 AM', days: 'Wednesdays', name: 'SOP Review', recipients: '#founderhubhq', color: 'gray' },
  { time: '10:00 AM', days: 'Fridays', name: 'Sales Digest', recipients: 'Leadership', color: 'purple' },
  { time: '4:00 PM', days: 'Mon–Fri', name: 'Afternoon Reminders', recipients: 'Each person (DM)', color: 'blue' },
  { time: '5:00 PM', days: 'Mon–Fri', name: 'Evening Escalation', recipients: 'Leadership', color: 'red' },
];

const ARCHETYPE_INFO = [
  { key: 'direct_driver', label: 'Direct Driver', color: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500', description: 'Short, action-first emails. Gets to the point immediately with clear next steps. No fluff.' },
  { key: 'analytical', label: 'Analytical', color: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500', description: 'Detail-oriented emails with specifics, numbers, and timelines. Includes 1–2 data points.' },
  { key: 'relational', label: 'Relational', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', description: 'Warm, personal tone with rapport-building language. Conversational and collaborative.' },
  { key: 'executive', label: 'Executive', color: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500', description: 'Minimal words, big-picture focus. 2–3 sentences max with one clear ask.' },
];

export default function Settings() {
  const { user } = useAuth();
  const isAdmin = user?.isAdmin ?? false;

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [escalationTargets, setEscalationTargets] = useState<EscalationTarget[]>([]);
  const [slackUsers, setSlackUsers] = useState<SlackUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAddEscalation, setShowAddEscalation] = useState(false);
  const [saving, setSaving] = useState<number | null>(null);

  // Add member form state
  const [newSlackId, setNewSlackId] = useState('');
  const [newTeam, setNewTeam] = useState('team_a');
  const [newRole, setNewRole] = useState('');

  // Add escalation form state
  const [escSlackId, setEscSlackId] = useState('');
  const [escRole, setEscRole] = useState('owner');

  const loadMembers = () => {
    api.teamMembers()
      .then(setMembers)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  const loadEscalationTargets = () => {
    api.escalationTargets()
      .then(setEscalationTargets)
      .catch((err: Error) => setError(err.message));
  };

  const loadSlackUsers = () => {
    api.slackUsers()
      .then(setSlackUsers)
      .catch((err: Error) => console.warn('Could not load Slack users:', err.message));
  };

  useEffect(() => {
    loadMembers();
    loadEscalationTargets();
    loadSlackUsers();
  }, []);

  const handleRoleChange = async (member: TeamMember, role: string) => {
    setSaving(member.id);
    try {
      await api.updateTeamMember(member.id, { coachingRole: role || null });
      loadMembers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  };

  const handleAdd = async () => {
    if (!newSlackId) return;
    const slackUser = slackUsers.find((u) => u.slackUserId === newSlackId);
    const displayName = slackUser?.displayName || newSlackId;
    try {
      await api.addTeamMember({
        slackUserId: newSlackId,
        displayName,
        team: newTeam,
        coachingRole: newRole || undefined,
      });
      setNewSlackId('');
      setNewTeam('team_a');
      setNewRole('');
      setShowAddForm(false);
      loadMembers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.deleteTeamMember(id);
      loadMembers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAddEscalation = async () => {
    if (!escSlackId) return;
    const slackUser = slackUsers.find((u) => u.slackUserId === escSlackId);
    const displayName = slackUser?.displayName || escSlackId;
    try {
      await api.addEscalationTarget({ slackUserId: escSlackId, displayName, role: escRole });
      setEscSlackId('');
      setEscRole('owner');
      setShowAddEscalation(false);
      loadEscalationTargets();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteEscalation = async (id: number) => {
    try {
      await api.deleteEscalationTarget(id);
      loadEscalationTargets();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your team, coaching roles, escalation targets, and system configuration</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700">&times;</button>
        </div>
      )}

      {/* ─── Team Members ───────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 tracking-wide uppercase">Team Members</h2>
            <p className="text-xs text-gray-400 mt-0.5">Assign coaching roles to determine which methodology each rep receives</p>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3 py-1.5 bg-[#4F3588] text-white text-sm font-medium rounded-lg hover:bg-[#5A3C9E] transition-colors"
          >
            {showAddForm ? 'Cancel' : '+ Add Member'}
          </button>
        </div>

        {showAddForm && (
          <div className="px-6 py-4 bg-[#FAF9FE] border-b border-gray-100">
            <div className="grid grid-cols-4 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Slack User</label>
                <select
                  value={newSlackId}
                  onChange={(e) => setNewSlackId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4F3588]/20 focus:border-[#4F3588] bg-white"
                >
                  <option value="">Select a team member...</option>
                  {slackUsers
                    .filter((u) => !members.some((m) => m.slackUserId === u.slackUserId))
                    .map((u) => (
                      <option key={u.slackUserId} value={u.slackUserId}>
                        {u.displayName}{u.title ? ` \u2014 ${u.title}` : ''}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Team</label>
                <select
                  value={newTeam}
                  onChange={(e) => setNewTeam(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4F3588]/20 focus:border-[#4F3588] bg-white"
                >
                  {TEAM_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Coaching Role</label>
                <div className="flex gap-2">
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4F3588]/20 focus:border-[#4F3588] bg-white"
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleAdd}
                    disabled={!newSlackId}
                    className="px-4 py-2 bg-[#4F3588] text-white text-sm font-medium rounded-lg hover:bg-[#5A3C9E] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {members.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-gray-400 text-sm">No team members configured yet.</p>
            <p className="text-gray-400 text-xs mt-1">Add team members to assign coaching roles. Without explicit roles, the system auto-detects from call patterns.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Slack ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Team</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Coaching Role</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {members.map((member) => (
                <tr key={member.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-3.5">
                    <span className="text-sm font-medium text-gray-900">{member.displayName || '\u2014'}</span>
                  </td>
                  <td className="px-6 py-3.5">
                    <code className="text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded">{member.slackUserId}</code>
                  </td>
                  <td className="px-6 py-3.5">
                    <span className="text-sm text-gray-600">
                      {member.team === 'team_a' ? 'Team A' : 'Team B'}
                    </span>
                  </td>
                  <td className="px-6 py-3.5">
                    <select
                      value={member.coachingRole || ''}
                      onChange={(e) => handleRoleChange(member, e.target.value)}
                      disabled={saving === member.id}
                      className={[
                        'px-3 py-1.5 border rounded-lg text-sm bg-white transition-colors',
                        member.coachingRole === 'sales'
                          ? 'border-blue-200 text-blue-700 bg-blue-50'
                          : member.coachingRole === 'cs'
                          ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
                          : 'border-gray-200 text-gray-500',
                        saving === member.id ? 'opacity-50' : '',
                      ].join(' ')}
                    >
                      {ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <button
                      onClick={() => handleDelete(member.id)}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Coaching Role Explanation */}
      <div className="bg-white rounded-xl border border-gray-200 px-6 py-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">How Coaching Roles Work</h3>
        <div className="grid grid-cols-3 gap-6 text-sm">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              <span className="font-medium text-gray-700">Sales</span>
            </div>
            <p className="text-gray-400 text-xs leading-relaxed">
              Coaching based on Sandler, SPIN Selling, Challenger Sale, and Grant Cardone methodologies.
              Focuses on discovery depth, objection handling, urgency creation, and close attempts.
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="font-medium text-gray-700">Customer Success</span>
            </div>
            <p className="text-gray-400 text-xs leading-relaxed">
              Coaching focused on value delivery, adoption signals, health checks, expansion sensing,
              risk detection, and champion building.
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-gray-300"></span>
              <span className="font-medium text-gray-700">Auto-detect</span>
            </div>
            <p className="text-gray-400 text-xs leading-relaxed">
              When no role is set, the system analyzes call patterns (outcomes, titles) to determine
              the coaching methodology. May be less accurate than explicit assignment.
            </p>
          </div>
        </div>
      </div>

      {/* ─── Escalation Targets (admin only) ──────────────────────── */}
      {isAdmin && <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 tracking-wide uppercase">Escalation Targets</h2>
            <p className="text-xs text-gray-400 mt-0.5">Leadership who receive overdue task escalations, coaching summaries, and proactive alerts</p>
          </div>
          <button
            onClick={() => setShowAddEscalation(!showAddEscalation)}
            className="px-3 py-1.5 bg-[#4F3588] text-white text-sm font-medium rounded-lg hover:bg-[#5A3C9E] transition-colors"
          >
            {showAddEscalation ? 'Cancel' : '+ Add Target'}
          </button>
        </div>

        {showAddEscalation && (
          <div className="px-6 py-4 bg-[#FAF9FE] border-b border-gray-100">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Slack User</label>
                <select
                  value={escSlackId}
                  onChange={(e) => setEscSlackId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4F3588]/20 focus:border-[#4F3588] bg-white"
                >
                  <option value="">Select a person...</option>
                  {slackUsers
                    .filter((u) => !escalationTargets.some((t) => t.slackUserId === u.slackUserId))
                    .map((u) => (
                      <option key={u.slackUserId} value={u.slackUserId}>
                        {u.displayName}{u.title ? ` \u2014 ${u.title}` : ''}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Role</label>
                <div className="flex gap-2">
                  <select
                    value={escRole}
                    onChange={(e) => setEscRole(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4F3588]/20 focus:border-[#4F3588] bg-white"
                  >
                    {ESCALATION_ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleAddEscalation}
                    disabled={!escSlackId}
                    className="px-4 py-2 bg-[#4F3588] text-white text-sm font-medium rounded-lg hover:bg-[#5A3C9E] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {escalationTargets.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <p className="text-gray-400 text-sm">No escalation targets configured.</p>
            <p className="text-gray-400 text-xs mt-1">Add leadership members who should receive overdue task alerts and coaching summaries.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Slack ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {escalationTargets.map((target) => (
                <tr key={target.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-3.5">
                    <span className="text-sm font-medium text-gray-900">{target.displayName || '\u2014'}</span>
                  </td>
                  <td className="px-6 py-3.5">
                    <code className="text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded">{target.slackUserId}</code>
                  </td>
                  <td className="px-6 py-3.5">
                    <span className={[
                      'text-xs px-2.5 py-1 rounded-full font-medium',
                      target.role === 'owner'
                        ? 'bg-purple-50 text-purple-700'
                        : 'bg-gray-100 text-gray-600',
                    ].join(' ')}>
                      {target.role === 'owner' ? 'Owner' : 'Manager'}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <button
                      onClick={() => handleDeleteEscalation(target.id)}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>}

      {/* ─── Notification Schedules ─────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900 tracking-wide uppercase">Notification Schedule</h2>
          <p className="text-xs text-gray-400 mt-0.5">All automated notifications and their schedules. Times are in Central Time (America/Chicago).</p>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Time (CT)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Days</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Notification</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Recipients</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {NOTIFICATION_SCHEDULE.map((schedule, i) => (
              <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-6 py-3">
                  <span className="text-sm font-mono text-gray-700">{schedule.time}</span>
                </td>
                <td className="px-6 py-3">
                  <span className="text-sm text-gray-600">{schedule.days}</span>
                </td>
                <td className="px-6 py-3">
                  <span className="text-sm font-medium text-gray-900">{schedule.name}</span>
                </td>
                <td className="px-6 py-3">
                  <span className={[
                    'text-xs px-2 py-0.5 rounded border font-medium',
                    schedule.color === 'purple' ? 'bg-purple-50 text-purple-600 border-purple-200'
                      : schedule.color === 'red' ? 'bg-red-50 text-red-600 border-red-200'
                      : schedule.color === 'emerald' ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                      : schedule.color === 'blue' ? 'bg-blue-50 text-blue-600 border-blue-200'
                      : 'bg-gray-50 text-gray-500 border-gray-200',
                  ].join(' ')}>
                    {schedule.recipients}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ─── Follow-Up Email Preferences ────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 px-6 py-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-gray-900 tracking-wide uppercase">Follow-Up Email Preferences</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Follow-up emails are automatically personalized based on the prospect's communication style
            detected from the Zoom call transcript. The rep's coaching role (Sales/CS) also influences email tone.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {ARCHETYPE_INFO.map((arch) => (
            <div key={arch.key} className={`rounded-lg border p-4 ${arch.color}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-2.5 h-2.5 rounded-full ${arch.dot}`}></span>
                <span className="text-sm font-semibold">{arch.label}</span>
                <span className="text-xs opacity-60 ml-auto font-mono">{arch.key}</span>
              </div>
              <p className="text-xs leading-relaxed opacity-80">{arch.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 bg-[#FAF9FE] rounded-lg p-4 border border-[#F3F1FC]">
          <p className="text-xs text-gray-500 leading-relaxed">
            <strong className="text-gray-700">How it works:</strong> When a Zoom call is recorded and transcribed,
            Atlas Chief analyzes each external participant's speaking style to classify their communication archetype.
            The follow-up email draft is then tailored to match their preferred communication style — direct and brief
            for Direct Drivers, detailed and specific for Analyticals, warm and personal for Relationals, and concise
            with a clear ask for Executives. You can view and edit drafts on the Intelligence page before sending.
          </p>
        </div>
      </div>
    </div>
  );
}
