Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition '
using System;
using System.Runtime.InteropServices;
public class Mouse {
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int cButtons, int dwExtraInfo);
}
'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::WriteLine("MOUSE_READY")

while ($true) {
    $line = [Console]::ReadLine()
    if ($line -eq $null -or $line -eq "exit") { break }
    try {
        $parts = $line -split " "
        $cmd = $parts[0]
        if ($cmd -eq "MOVE") {
            $x = [int]$parts[1]
            $y = [int]$parts[2]
            [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($x, $y)
            [Console]::WriteLine("MOVED_TO " + $x + " " + $y)
        }
        elseif ($cmd -eq "CLICK_DOWN") {
            [Mouse]::mouse_event(0x02, 0, 0, 0, 0)
            [Console]::WriteLine("CLICKED_DOWN")
        }
        elseif ($cmd -eq "CLICK_UP") {
            [Mouse]::mouse_event(0x04, 0, 0, 0, 0)
            [Console]::WriteLine("CLICKED_UP")
        }
        elseif ($cmd -eq "RIGHT_CLICK") {
            [Mouse]::mouse_event(0x08, 0, 0, 0, 0)
            [Mouse]::mouse_event(0x10, 0, 0, 0, 0)
            [Console]::WriteLine("RIGHT_CLICKED")
        }
    } catch {
        [Console]::WriteLine("ERROR: " + $_.Exception.Message)
    }
}
