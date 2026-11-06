# Step 2 test: with the stone already open in Advisor, runs one planning command,
# watches until Advisor has finished, then opens Save As and fills in a test name.
# It does NOT press Save. Look at the result, then press Cancel in Save Stone yourself.
& {
$Stone    = "1.S525-412"          # the stone that is open in Advisor now
$Planning = 42023                 # 42022 Makeable, 42023 Best Pair, 42140 Best Remainder
$TestName = "1.S525-412-AUTOTEST" # written in Stone Name, not saved

$log = Join-Path ([Environment]::GetFolderPath('Desktop')) 'advisor-step2-log.txt'
Set-Content -Path $log -Value "" -Encoding UTF8
function Log($m) { $line = (Get-Date).ToString('HH:mm:ss') + '  ' + $m; Add-Content -Path $log -Value $line -Encoding UTF8; Write-Host $line }

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms

if (-not ('AdvStep3' -as [type])) {
Add-Type -TypeDefinition @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class AdvStep3 {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr p);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern void mouse_event(uint f, uint x, uint y, uint d, IntPtr e);
  public static string Title(IntPtr h) { var s = new StringBuilder(512); GetWindowText(h, s, 512); return s.ToString(); }
  public static List<IntPtr> All() {
    var r = new List<IntPtr>();
    EnumWindows((h, p) => { if (IsWindowVisible(h) && Title(h).Length > 0) r.Add(h); return true; }, IntPtr.Zero);
    return r;
  }
  public static IntPtr Find(string part) {
    foreach (var h in All()) if (Title(h).IndexOf(part, StringComparison.OrdinalIgnoreCase) >= 0) return h;
    return IntPtr.Zero;
  }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public static int Pid(IntPtr h) { uint p; GetWindowThreadProcessId(h, out p); return (int)p; }
  public static void Click(int x, int y) {
    SetCursorPos(x, y); mouse_event(2, 0, 0, 0, IntPtr.Zero); mouse_event(4, 0, 0, 0, IntPtr.Zero);
  }
  public static void DoubleClick(int x, int y) {
    SetCursorPos(x, y);
    for (int i = 0; i < 2; i++) { mouse_event(2, 0, 0, 0, IntPtr.Zero); mouse_event(4, 0, 0, 0, IntPtr.Zero); }
  }
}
"@
}

[AdvStep3]::SetProcessDPIAware() | Out-Null
$AE = [System.Windows.Automation.AutomationElement]
function FocusIs($id) {
  try { return ($AE::FocusedElement.Current.AutomationId -eq $id) } catch { return $false }
}
function ById($el, $id) {
  $c = New-Object System.Windows.Automation.PropertyCondition($AE::AutomationIdProperty, $id)
  $el.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $c)
}
function ByName($el, $name) {
  $c = New-Object System.Windows.Automation.PropertyCondition($AE::NameProperty, $name)
  $el.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $c)
}
function SetText($el, $text) {
  $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue($text)
}
function PressEnter($el) {
  try { $el.SetFocus() } catch {}
  Start-Sleep -Milliseconds 300
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
}
function WaitFor($part, $seconds) {
  for ($i = 0; $i -lt $seconds * 2; $i++) { $h = [AdvStep3]::Find($part); if ($h -ne [IntPtr]::Zero) { return $h }; Start-Sleep -Milliseconds 500 }
  return [IntPtr]::Zero
}
function Dump($el, $depth, $max) {
  if ($depth -gt $max) { return }
  $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $ch = $walker.GetFirstChild($el)
  while ($ch -ne $null) {
    $i = $ch.Current
    Log ((' ' * ($depth * 2)) + $i.ControlType.ProgrammaticName + "  name='" + $i.Name + "'  id='" + $i.AutomationId + "'  class='" + $i.ClassName + "'")
    Dump $ch ($depth + 1) $max
    $ch = $walker.GetNextSibling($ch)
  }
}


$adv = [AdvStep3]::Find('Advisor 7.601')
if ($adv -eq [IntPtr]::Zero) { Log 'Advisor window not found. Open Advisor first.'; return }
$title0 = [AdvStep3]::Title($adv)
Log ("Advisor: " + $title0)
if ($title0 -notlike "*$Stone*") { Log ("The open stone is not " + $Stone + ". Open it first."); return }
$proc = Get-Process -Id ([AdvStep3]::Pid($adv))
Log ("Advisor program: " + $proc.ProcessName + " (" + $proc.Id + ")")

# 1. Planning command
$before = [AdvStep3]::All()
$cpu0 = $proc.TotalProcessorTime.TotalSeconds
[AdvStep3]::PostMessage($adv, 0x111, [IntPtr]$Planning, [IntPtr]::Zero) | Out-Null
Log ("Sent planning command " + $Planning)

# 2. Watch until Advisor is quiet: little CPU for 6 seconds in a row, no new window open
$seen = @{}
$quiet = 0
$start = Get-Date
$lastTitle = $title0
while ($true) {
  Start-Sleep -Seconds 1
  $proc.Refresh()
  $cpu = $proc.TotalProcessorTime.TotalSeconds
  $use = $cpu - $cpu0; $cpu0 = $cpu
  $t = [AdvStep3]::Title($adv)
  if ($t -ne $lastTitle) { Log ("Title changed: " + $t); $lastTitle = $t }
  $open = @([AdvStep3]::All() | Where-Object { $before -notcontains $_ })
  foreach ($w in $open) {
    if (-not $seen.ContainsKey([string]$w)) {
      $seen[[string]$w] = 1
      $pn = ''; try { $pn = (Get-Process -Id ([AdvStep3]::Pid($w))).ProcessName } catch {}
      Log ("New window: '" + [AdvStep3]::Title($w) + "' from " + $pn)
      try { Dump ($AE::FromHandle($w)) 1 4 } catch {}
    }
  }
  $secs = [int]((Get-Date) - $start).TotalSeconds
  if ($secs % 10 -eq 0) { Log ("  " + $secs + " s, CPU used last second: " + [math]::Round($use, 2) + ", new windows open: " + $open.Count) }
  if ($use -lt 0.05) { $quiet++ } else { $quiet = 0 }
  if ($secs -ge 5 -and $quiet -ge 6) {
    if ($open.Count -eq 0) { Log ("Advisor looks finished after " + $secs + " s"); break }
    Log 'A window is open and Advisor is idle, so it is probably waiting for an answer. Stopping here; send me a photo of it.'
    return
  }
  if ($secs -gt 900) { Log 'Still busy after 15 minutes, stopping the watch.'; return }
}
Log ("Title now: " + [AdvStep3]::Title($adv))

# 3. Save As: fill in the test name, do not press Save
$before2 = [AdvStep3]::All()
[AdvStep3]::PostMessage($adv, 0x111, [IntPtr]42027, [IntPtr]::Zero) | Out-Null
$sh = WaitFor 'Save Stone' 20
if ($sh -eq [IntPtr]::Zero) { Log 'Save Stone did not open'; return }
$sw = $AE::FromHandle($sh)
Start-Sleep -Seconds 2
$dir = ById $sw 'PART_EditableTextBox'
try { Log ("Save Stone directory: '" + $dir.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value + "'") } catch {}
$nb = ById $sw 'NameTB'
if ($nb -eq $null) { Log 'Stone Name box not found'; return }
try { Log ("Stone Name before: '" + $nb.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value + "'") } catch {}
SetText $nb $TestName
Start-Sleep -Milliseconds 500
try { Log ("Stone Name now: '" + $nb.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value + "'") } catch {}
$sb = ById $sw 'SaveBtn'
if ($sb -ne $null) { $r = $sb.Current.BoundingRectangle; Log ("Save button found at " + [int]$r.X + "," + [int]$r.Y + " (not pressed)") }
Log 'Done. Check the plan in Advisor, then press Cancel in Save Stone.'
[System.Windows.Forms.MessageBox]::Show('Step 2 done. Nothing saved. Press Cancel in Save Stone, then send advisor-step2-log.txt.') | Out-Null
}
