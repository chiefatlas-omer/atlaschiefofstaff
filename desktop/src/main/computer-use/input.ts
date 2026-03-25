// Input control using PowerShell (works on Windows ARM64 and x64)
// Falls back to nut.js if available, otherwise uses PowerShell SendInput

import { execSync } from 'child_process';

export interface ComputerAction {
  action: string;
  coordinate?: [number, number];
  text?: string;
  start_coordinate?: [number, number];
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number;
}

function ps(script: string): string {
  try {
    return execSync(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`, {
      timeout: 5000,
      encoding: 'utf8',
    }).trim();
  } catch (err: any) {
    console.error('[INPUT] PowerShell error:', err.message);
    return '';
  }
}

export async function executeAction(action: ComputerAction): Promise<string> {
  switch (action.action) {
    case 'mouse_move': {
      if (!action.coordinate) throw new Error('mouse_move requires coordinate');
      const [x, y] = action.coordinate;
      ps(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})`);
      return `Moved mouse to (${x}, ${y})`;
    }

    case 'left_click': {
      if (action.coordinate) {
        const [x, y] = action.coordinate;
        ps(`
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})
          Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);' -Name Win32 -Namespace API
          Start-Sleep -Milliseconds 50
          [API.Win32]::mouse_event(0x0002, 0, 0, 0, 0)
          [API.Win32]::mouse_event(0x0004, 0, 0, 0, 0)
        `);
      } else {
        ps(`
          Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);' -Name Win32 -Namespace API
          [API.Win32]::mouse_event(0x0002, 0, 0, 0, 0)
          [API.Win32]::mouse_event(0x0004, 0, 0, 0, 0)
        `);
      }
      return `Left clicked at (${action.coordinate?.[0] || '?'}, ${action.coordinate?.[1] || '?'})`;
    }

    case 'right_click': {
      if (action.coordinate) {
        const [x, y] = action.coordinate;
        ps(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})`);
      }
      ps(`
        Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);' -Name Win32 -Namespace API
        [API.Win32]::mouse_event(0x0008, 0, 0, 0, 0)
        [API.Win32]::mouse_event(0x0010, 0, 0, 0, 0)
      `);
      return `Right clicked`;
    }

    case 'double_click': {
      if (action.coordinate) {
        const [x, y] = action.coordinate;
        ps(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})`);
      }
      ps(`
        Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);' -Name Win32 -Namespace API
        Start-Sleep -Milliseconds 50
        [API.Win32]::mouse_event(0x0002, 0, 0, 0, 0)
        [API.Win32]::mouse_event(0x0004, 0, 0, 0, 0)
        Start-Sleep -Milliseconds 50
        [API.Win32]::mouse_event(0x0002, 0, 0, 0, 0)
        [API.Win32]::mouse_event(0x0004, 0, 0, 0, 0)
      `);
      return `Double clicked`;
    }

    case 'type': {
      if (!action.text) throw new Error('type requires text');
      // Use clipboard + Ctrl+V for reliable typing (handles special chars)
      const { clipboard } = require('electron');
      const saved = clipboard.readText();
      clipboard.writeText(action.text);
      ps(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')`);
      setTimeout(() => clipboard.writeText(saved), 300);
      return `Typed "${action.text.substring(0, 30)}${action.text.length > 30 ? '...' : ''}"`;
    }

    case 'key': {
      if (!action.text) throw new Error('key requires text');
      // Map Claude key names to SendKeys format
      const sendKeysMap: Record<string, string> = {
        'Return': '~', 'Enter': '~', 'Tab': '{TAB}', 'Escape': '{ESC}',
        'Backspace': '{BACKSPACE}', 'Delete': '{DELETE}', 'space': ' ',
        'Up': '{UP}', 'Down': '{DOWN}', 'Left': '{LEFT}', 'Right': '{RIGHT}',
        'Home': '{HOME}', 'End': '{END}', 'Page_Up': '{PGUP}', 'Page_Down': '{PGDN}',
        'F1': '{F1}', 'F2': '{F2}', 'F3': '{F3}', 'F4': '{F4}',
        'F5': '{F5}', 'F6': '{F6}', 'F7': '{F7}', 'F8': '{F8}',
        'F9': '{F9}', 'F10': '{F10}', 'F11': '{F11}', 'F12': '{F12}',
      };

      const parts = action.text.split('+').map(k => k.trim());
      let sendKeys = '';
      for (const part of parts) {
        if (part === 'ctrl' || part === 'Control_L') sendKeys += '^';
        else if (part === 'alt' || part === 'Alt_L') sendKeys += '%';
        else if (part === 'shift' || part === 'Shift_L') sendKeys += '+';
        else if (sendKeysMap[part]) sendKeys += sendKeysMap[part];
        else if (part.length === 1) sendKeys += part.toLowerCase();
        else sendKeys += `{${part.toUpperCase()}}`;
      }
      ps(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${sendKeys.replace(/'/g, "''")}')`);
      return `Pressed ${action.text}`;
    }

    case 'scroll': {
      const amount = action.amount || 3;
      const direction = action.direction || 'down';
      if (action.coordinate) {
        const [x, y] = action.coordinate;
        ps(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})`);
      }
      const scrollAmount = direction === 'up' || direction === 'left' ? amount * 120 : -(amount * 120);
      ps(`
        Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);' -Name Win32 -Namespace API
        [API.Win32]::mouse_event(0x0800, 0, 0, ${scrollAmount}, 0)
      `);
      return `Scrolled ${direction} by ${amount}`;
    }

    case 'cursor_position': {
      const result = ps(`Add-Type -AssemblyName System.Windows.Forms; $p = [System.Windows.Forms.Cursor]::Position; Write-Output "$($p.X),$($p.Y)"`);
      return `Cursor at (${result})`;
    }

    case 'screenshot': {
      // Handled by the agent loop, not here
      return 'Screenshot requested';
    }

    default:
      return `Unknown action: ${action.action}`;
  }
}
