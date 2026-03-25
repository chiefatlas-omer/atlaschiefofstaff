import Anthropic from '@anthropic-ai/sdk';
import { BrowserWindow } from 'electron';
import { config } from '../config';
import { captureScreen } from './screen';
import { executeAction, ComputerAction } from './input';
import { IPC } from '../../shared/types';

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

const MAX_ITERATIONS = 25;
const TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

export async function runComputerUseAgent(
  command: string,
  mainWindow: BrowserWindow,
): Promise<string> {
  const startTime = Date.now();

  // Get screen dimensions for the computer tool
  const initialCapture = await captureScreen();
  const { width: displayWidth, height: displayHeight } = initialCapture;

  const systemPrompt = `You are controlling a desktop computer to complete the user's request.
You have access to the computer tool which lets you take screenshots, move the mouse, click, type, and press keys.
Complete the user's request step by step. After each action, a new screenshot will be provided automatically.
Examine each screenshot carefully to verify your action worked before proceeding.
When the task is complete, respond with a brief summary of what you did.
Current screen resolution: ${displayWidth}x${displayHeight}`;

  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: command,
        },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: initialCapture.base64,
          },
        },
      ],
    },
  ];

  const tools: Anthropic.Messages.Tool[] = [
    {
      type: 'computer_20251124' as any,
      name: 'computer',
      display_width_px: displayWidth,
      display_height_px: displayHeight,
      display_number: 1,
    } as any,
  ];

  let iteration = 0;

  while (iteration < MAX_ITERATIONS) {
    // Check timeout
    if (Date.now() - startTime > TIMEOUT_MS) {
      mainWindow.webContents.send(IPC.COMPUTER_USE_STATUS, 'Timed out after 2 minutes');
      return 'Computer use timed out. The task may not be fully complete.';
    }

    iteration++;
    mainWindow.webContents.send(
      IPC.COMPUTER_USE_STATUS,
      `Step ${iteration}/${MAX_ITERATIONS}: Thinking...`,
    );

    try {
      const response = await (anthropic as any).beta.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages,
        tools,
        betas: ['computer-use-2025-11-24'],
      });

      // Check if Claude wants to use a tool
      const content = response.content as any[];
      const toolUseBlocks = content.filter(
        (block: any) => block.type === 'tool_use',
      );
      const textBlocks = content.filter(
        (block: any) => block.type === 'text',
      );

      // If no tool use, Claude is done — return the text response
      if (toolUseBlocks.length === 0) {
        const resultText = textBlocks.map((b: any) => b.text).join('\n') || 'Task completed.';
        mainWindow.webContents.send(IPC.COMPUTER_USE_STATUS, 'Complete!');
        return resultText;
      }

      // Add assistant response to messages
      messages.push({ role: 'assistant', content: response.content });

      // Process each tool use
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        const input = toolUse.input as ComputerAction;

        // Handle screenshot action specially
        if (input.action === 'screenshot') {
          mainWindow.webContents.send(IPC.COMPUTER_USE_STATUS, 'Taking screenshot...');
          const capture = await captureScreen();
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: capture.base64,
                },
              },
            ],
          });
        } else {
          // Execute the action
          const description = await executeAction(input);
          mainWindow.webContents.send(IPC.COMPUTER_USE_STATUS, description);

          // Wait for UI to settle, then take a follow-up screenshot
          await new Promise((resolve) => setTimeout(resolve, 500));
          const capture = await captureScreen();

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: [
              {
                type: 'text',
                text: description,
              },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: capture.base64,
                },
              },
            ],
          });
        }
      }

      // Add tool results to messages
      messages.push({ role: 'user', content: toolResults });

      // Check stop reason
      if (response.stop_reason === 'end_turn') {
        const resultText = textBlocks.map((b: any) => b.text).join('\n') || 'Task completed.';
        return resultText;
      }
    } catch (err: any) {
      console.error(`Computer use iteration ${iteration} failed:`, err);
      mainWindow.webContents.send(IPC.COMPUTER_USE_STATUS, `Error: ${err.message}`);
      return `Computer use failed at step ${iteration}: ${err.message}`;
    }
  }

  return 'Reached maximum iterations (25). Task may not be fully complete.';
}
