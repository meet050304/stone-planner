# Step 1 test: opens one stone in Advisor through Stone > Open, then opens Save As and
# writes down what the Save As window contains. It does NOT save anything.
# Leave the Save As window open when it finishes and press Cancel yourself.
& {
$Folder = "F:\autook\401-500"
$Stone  = "1.S525-412.adv"

$log = Join-Path ([Environment]::GetFolderPath('Desktop')) 'advisor-step1-log.txt'
Set-Content -Path $log -Value "" -Encoding UTF8
function Log($m) { $line = (Get-Date).ToString('HH:mm:ss') + '  ' + $m; Add-Content -Path $log -Value $line -Encoding UTF8; Write-Host $line }

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms

if (-not ('AdvStep2' -as [type])) {
Add-Type -TypeDefinition @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class AdvStep2 {
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

[AdvStep2]::SetProcessDPIAware() | Out-Null
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
  for ($i = 0; $i -lt $seconds * 2; $i++) { $h = [AdvStep2]::Find($part); if ($h -ne [IntPtr]::Zero) { return $h }; Start-Sleep -Milliseconds 500 }
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

$base = [IO.Path]::GetFileNameWithoutExtension($Stone)
$adv = [AdvStep2]::Find('Advisor 7.601')
if ($adv -eq [IntPtr]::Zero) { Log 'Advisor window not found. Open Advisor first.'; return }
Log ("Advisor: " + [AdvStep2]::Title($adv))

# 1. Stone > Open
[AdvStep2]::PostMessage($adv, 0x111, [IntPtr]42026, [IntPtr]::Zero) | Out-Null
$h = WaitFor 'Load Stone' 30
if ($h -eq [IntPtr]::Zero) { Log 'Load Stone window did not appear.'; return }
Log 'Load Stone window found'
$win = $AE::FromHandle($h)

# 2. Folder: if the Directory box is not the folder, use the folder icon beside it, then check it
if (-not (Test-Path (Join-Path $Folder $Stone))) { Log ("File not found on disk: " + (Join-Path $Folder $Stone)); return }
$dir = ById $win 'PART_EditableTextBox'
if ($dir -eq $null) { Log 'Directory box not found'; return }
$dirNow = ''
try { $dirNow = $dir.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value } catch {}
Log ("Directory box holds: '" + $dirNow + "'")
if ($dirNow.TrimEnd('\') -ne $Folder.TrimEnd('\')) {
  # Folder icon beside the Directory box opens the Windows folder window
  $browse = ById $win 'BrowseBtn'
  if ($browse -eq $null) { Log 'Folder icon (BrowseBtn) not found'; return }
  $before0 = [AdvStep2]::All()
  [AdvStep2]::SetForegroundWindow($h) | Out-Null
  Start-Sleep -Milliseconds 400
  $br = $browse.Current.BoundingRectangle
  [AdvStep2]::Click([int]($br.X + $br.Width / 2), [int]($br.Y + $br.Height / 2))
  Log 'Pressed the folder icon'
  $pick = [IntPtr]::Zero
  for ($i = 0; $i -lt 20 -and $pick -eq [IntPtr]::Zero; $i++) {
    Start-Sleep -Milliseconds 500
    $new0 = [AdvStep2]::All() | Where-Object { $before0 -notcontains $_ }
    if ($new0) { $pick = @($new0)[0] }
  }
  if ($pick -eq [IntPtr]::Zero) { Log 'No folder window appeared'; return }
  Log ("Folder window: '" + [AdvStep2]::Title($pick) + "'")
  $pw = $AE::FromHandle($pick)
  Dump $pw 1 6
  # Modern Windows folder window: 'Folder:' box (id 1152) and 'Select Folder' button (id 1)
  $fbox = ById $pw '1152'
  $okb = ById $pw '1'
  if ($fbox -eq $null -or $okb -eq $null) { Log 'This folder window is a different kind. Leave it open and send me the log.'; return }
  SetText $fbox $Folder
  Start-Sleep -Milliseconds 500
  $okb.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
  Log ("Chose folder " + $Folder + " in the folder window")
}
Start-Sleep -Seconds 4
$dirNow = ''
try { $dirNow = $dir.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value } catch {}
Log ("Directory box now holds: '" + $dirNow + "'")
if ($dirNow.TrimEnd('\') -ne $Folder.TrimEnd('\')) { Log 'Directory is not the right folder. Stopping here, nothing opened.'; return }

# 3. Stone: find its row in the list (no typing), select it, double-click it
$grid = ById $win 'TheGrid'
if ($grid -eq $null) { Log 'List (TheGrid) not found'; return }
$tc = New-Object System.Windows.Automation.PropertyCondition($AE::ClassNameProperty, 'DataGridCell')
$row = $null
try {
  $ic = $grid.GetCurrentPattern([System.Windows.Automation.ItemContainerPattern]::Pattern)
  $item = $ic.FindItemByProperty($null, $null, $null)
  $n = 0
  while ($item -ne $null -and $row -eq $null -and $n -lt 5000) {
    $n++
    try { $item.GetCurrentPattern([System.Windows.Automation.VirtualizedItemPattern]::Pattern).Realize() } catch {}
    $first = $item.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $tc)
    if ($first -ne $null -and $first.Current.Name -eq $Stone) { $row = $item }
    else { $item = $ic.FindItemByProperty($item, $null, $null) }
  }
  Log ("Looked at " + $n + " rows")
} catch { Log ("Could not go through the list: " + $_) }
if ($row -eq $null) { Log ("Stone not found in the list: " + $Stone); return }
try { $row.GetCurrentPattern([System.Windows.Automation.ScrollItemPattern]::Pattern).ScrollIntoView() } catch {}
try { $row.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select() } catch {}
Start-Sleep -Milliseconds 800
$cell = $row.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $tc)
if ($cell -eq $null -or $cell.Current.Name -ne $Stone) { Log 'Row changed after scrolling, stopping.'; return }
$r = $cell.Current.BoundingRectangle
Log ("Found " + $cell.Current.Name + " at " + [int]$r.X + "," + [int]$r.Y)
[AdvStep2]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 400
[AdvStep2]::DoubleClick([int]($r.X + $r.Width / 2), [int]($r.Y + $r.Height / 2))
Log 'Double-clicked the stone'

# 4. Wait until Advisor shows the stone
$ok = $false
for ($i = 0; $i -lt 360; $i++) {
  if ([AdvStep2]::Title($adv) -like "*$base*") { $ok = $true; break }
  Start-Sleep -Milliseconds 500
}
if (-not $ok) { Log ("Advisor title did not change to the stone in 3 minutes: " + [AdvStep2]::Title($adv)); return }
Log ("Stone open: " + [AdvStep2]::Title($adv))
Start-Sleep -Seconds 3

# 5. Save As: open it and write down what is inside. Nothing is saved.
$before = [AdvStep2]::All()
[AdvStep2]::PostMessage($adv, 0x111, [IntPtr]42027, [IntPtr]::Zero) | Out-Null
Start-Sleep -Seconds 4
$new = [AdvStep2]::All() | Where-Object { $before -notcontains $_ }
if (-not $new) { Log 'No new window after Save As. Listing all windows:'; $new = [AdvStep2]::All() }
foreach ($w in $new) {
  Log ("WINDOW title='" + [AdvStep2]::Title($w) + "'")
  try { Dump ($AE::FromHandle($w)) 1 10 } catch { Log ("  could not read: " + $_) }
}
Log 'Done. Press Cancel in the Save As window yourself.'
[System.Windows.Forms.MessageBox]::Show('Step 1 done. Press Cancel in Save As, then send advisor-step1-log.txt from the Desktop.') | Out-Null
}
