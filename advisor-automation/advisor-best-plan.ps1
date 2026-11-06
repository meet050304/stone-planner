# Advisor run, step 2 on the Advisor PC: Advisor makes the plans, so every stone obeys its rules.
# The viewer's "Advisor run" has already put copies in the WorkFolder: [stone].adv holds our inclusion choices, and
# [stone]-OURSAW.adv also holds our saw. Each copy is opened fresh for each plan, planned, and saved to the SaveFolder:
#   [stone]-MK  Planning > Makeable
#   [stone]-BP  Planning > Best Pair
#   [stone]-BR  Planning > Best Pair, then Best Remainder
#   [stone]-MP  Planning > MultiPlan
#   [stone]-SAW from [stone]-OURSAW: Planning > Both, which fits the stones in each part of our saw
# A plan already in the SaveFolder is skipped, so a stopped run can be started again.
# Before the first run, set Load Stone to the WorkFolder by hand once.
# Do not touch the mouse or keyboard while it runs. Ctrl+C in this window stops it.
& {
$StoneFolder = "F:\autook\adv-work"    # the prepared copies (Load Stone must show this folder)
$SaveFolder  = "F:\autook\adv-saves"   # Advisor's saves are moved here
$MaxStones   = 1                       # how many stones this run (0 = all). Start with 1.
$MaxSeconds  = 1800                    # longest one planning command may run

$log = Join-Path ([Environment]::GetFolderPath('Desktop')) 'advisor-best-plan-log.txt'
Add-Content -Path $log -Value "" -Encoding UTF8
function Log($m) { $line = (Get-Date).ToString('HH:mm:ss') + '  ' + $m; Add-Content -Path $log -Value $line -Encoding UTF8; Write-Host $line }

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms

if (-not ('AdvResave' -as [type])) {
Add-Type -TypeDefinition @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class AdvResave {
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

[AdvResave]::SetProcessDPIAware() | Out-Null
$AE = [System.Windows.Automation.AutomationElement]
function ById($el, $id) {
  $c = New-Object System.Windows.Automation.PropertyCondition($AE::AutomationIdProperty, $id)
  $el.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $c)
}
function SetText($el, $text) {
  $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue($text)
}
function WaitFor($part, $seconds) {
  for ($i = 0; $i -lt $seconds * 2; $i++) { $h = [AdvResave]::Find($part); if ($h -ne [IntPtr]::Zero) { return $h }; Start-Sleep -Milliseconds 500 }
  return [IntPtr]::Zero
}
function Val($el) { try { return $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value } catch { return '' } }
function Center($el) { $r = $el.Current.BoundingRectangle; return @([int]($r.X + $r.Width / 2), [int]($r.Y + $r.Height / 2)) }

# Waits until Advisor has done little work for 6 seconds in a row. Returns 'done', 'window' or 'timeout'.
function WaitIdle($proc, $before, $maxSecs) {
  $cpu0 = $proc.TotalProcessorTime.TotalSeconds; $quiet = 0; $start = Get-Date
  while ($true) {
    Start-Sleep -Seconds 1
    $proc.Refresh(); $cpu = $proc.TotalProcessorTime.TotalSeconds; $use = $cpu - $cpu0; $cpu0 = $cpu
    $open = @([AdvResave]::All() | Where-Object { $before -notcontains $_ })
    if ($use -lt 0.05) { $quiet++ } else { $quiet = 0 }
    $secs = ((Get-Date) - $start).TotalSeconds
    if ($secs -ge 5 -and $quiet -ge 6) {
      if ($open.Count -eq 0) { return 'done' }
      foreach ($w in $open) { Log ("    window open: '" + [AdvResave]::Title($w) + "'") }
      return 'window'
    }
    if ($secs -gt $maxSecs) { return 'timeout' }
  }
}

function OpenStone($adv, $file) {
  $before = [AdvResave]::All()
  [AdvResave]::PostMessage($adv, 0x111, [IntPtr]42026, [IntPtr]::Zero) | Out-Null
  $h = WaitFor 'Load Stone' 30
  if ($h -eq [IntPtr]::Zero) {
    $open = @([AdvResave]::All() | Where-Object { $before -notcontains $_ })
    foreach ($w in $open) { Log ("    window open: '" + [AdvResave]::Title($w) + "'") }
    return 'Load Stone did not open'
  }
  $win = $AE::FromHandle($h)
  Start-Sleep -Seconds 2
  $dir = ById $win 'PART_EditableTextBox'
  $d = (Val $dir).TrimEnd('\')
  if ($d -ne $StoneFolder.TrimEnd('\')) { return ("Load Stone shows folder '" + $d + "'. Set it to " + $StoneFolder + " by hand once, then run again.") }
  $grid = ById $win 'TheGrid'
  $tc = New-Object System.Windows.Automation.PropertyCondition($AE::ClassNameProperty, 'DataGridCell')
  $row = $null
  for ($try = 0; $try -lt 10 -and $row -eq $null; $try++) {
    try {
      $ic = $grid.GetCurrentPattern([System.Windows.Automation.ItemContainerPattern]::Pattern)
      $item = $ic.FindItemByProperty($null, $null, $null); $n = 0
      while ($item -ne $null -and $row -eq $null -and $n -lt 5000) {
        $n++
        try { $item.GetCurrentPattern([System.Windows.Automation.VirtualizedItemPattern]::Pattern).Realize() } catch {}
        $first = $item.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $tc)
        if ($first -ne $null -and $first.Current.Name -eq $file) { $row = $item } else { $item = $ic.FindItemByProperty($item, $null, $null) }
      }
    } catch {}
    if ($row -eq $null) { Start-Sleep -Seconds 1 }
  }
  if ($row -eq $null) { return ($file + ' not in the Load Stone list') }
  try { $row.GetCurrentPattern([System.Windows.Automation.ScrollItemPattern]::Pattern).ScrollIntoView() } catch {}
  try { $row.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select() } catch {}
  Start-Sleep -Milliseconds 800
  $cell = $row.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $tc)
  if ($cell -eq $null -or $cell.Current.Name -ne $file) { return 'row changed after scrolling' }
  $c = Center $cell
  [AdvResave]::SetForegroundWindow($h) | Out-Null
  Start-Sleep -Milliseconds 400
  [AdvResave]::DoubleClick($c[0], $c[1])
  $base = [IO.Path]::GetFileNameWithoutExtension($file)
  for ($i = 0; $i -lt 360; $i++) {
    $t = [AdvResave]::Title($adv)
    if ($t -match ('\s' + [regex]::Escape($base) + '\s')) { return 'ok' }
    Start-Sleep -Milliseconds 500
  }
  return ('Advisor did not show ' + $base + ' within 3 minutes')
}

function SaveAs($adv, $proc, $name) {
  $before = [AdvResave]::All()
  [AdvResave]::PostMessage($adv, 0x111, [IntPtr]42027, [IntPtr]::Zero) | Out-Null
  $sh = WaitFor 'Save Stone' 30
  if ($sh -eq [IntPtr]::Zero) { return 'Save Stone did not open' }
  $sw = $AE::FromHandle($sh)
  Start-Sleep -Seconds 2
  $d = (Val (ById $sw 'PART_EditableTextBox')).TrimEnd('\')
  if ($d -ne $StoneFolder.TrimEnd('\')) { return ("Save Stone shows folder '" + $d + "', not " + $StoneFolder + ". Left open, nothing saved.") }
  $nb = ById $sw 'NameTB'
  if ($nb -eq $null) { return 'Stone Name box not found' }
  # click in the name box, put the name in, then click the Comment box so the name is taken
  [AdvResave]::SetForegroundWindow($sh) | Out-Null
  Start-Sleep -Milliseconds 400
  $c = Center $nb; [AdvResave]::Click($c[0], $c[1]); Start-Sleep -Milliseconds 300
  SetText $nb $name
  Start-Sleep -Milliseconds 300
  $cond = New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
  $grp = $null
  foreach ($g in $sw.FindAll([System.Windows.Automation.TreeScope]::Descendants, (New-Object System.Windows.Automation.PropertyCondition($AE::NameProperty, 'Save Information')))) { if ($g.Current.ClassName -eq 'GroupBox') { $grp = $g } }
  if ($grp -ne $null) {
    foreach ($e in $grp.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)) {
      if ($e.Current.AutomationId -eq '') { $c = Center $e; [AdvResave]::Click($c[0], $c[1]); break }
    }
  }
  Start-Sleep -Milliseconds 500
  if ((Val $nb) -ne $name) { return ("Stone Name shows '" + (Val $nb) + "', not " + $name + ". Left open, nothing saved.") }
  $sb = ById $sw 'SaveBtn'
  if ($sb -eq $null) { return 'Save button not found' }
  $c = Center $sb
  [AdvResave]::Click($c[0], $c[1])
  # wait for Save Stone to close and the file to appear
  $target = Join-Path $StoneFolder ($name + '.adv')
  for ($i = 0; $i -lt 120; $i++) {
    Start-Sleep -Milliseconds 500
    if ([AdvResave]::Find('Save Stone') -eq [IntPtr]::Zero -and (Test-Path $target)) { break }
  }
  if ([AdvResave]::Find('Save Stone') -ne [IntPtr]::Zero) {
    $open = @([AdvResave]::All() | Where-Object { $before -notcontains $_ })
    foreach ($w in $open) { Log ("    window open: '" + [AdvResave]::Title($w) + "'") }
    return 'Save Stone still open after pressing Save'
  }
  WaitIdle $proc @() 120 | Out-Null
  if (-not (Test-Path $target)) { return ($target + ' was not written') }
  return 'ok'
}

$adv = [AdvResave]::Find('Advisor 7.601')
if ($adv -eq [IntPtr]::Zero) { Log 'Advisor window not found. Open Advisor first.'; return }
$proc = Get-Process -Id ([AdvResave]::Pid($adv))
if (-not (Test-Path $StoneFolder)) { Log ("Work folder " + $StoneFolder + " not found. Run step 1 in the viewer first."); return }
if (-not (Test-Path $SaveFolder)) { New-Item -ItemType Directory -Path $SaveFolder | Out-Null }
Log ("Started. Copies: " + $StoneFolder + "  Saves: " + $SaveFolder)

# One job for each plan of each stone. A copy holding our saw only runs Both.
$stones = @(Get-ChildItem -Path $StoneFolder -Filter '*.adv' | Where-Object { -not $_.Name.StartsWith('._') -and $_.BaseName -notmatch '-(MK|BP|BR|MP|SAW)$' -and $_.BaseName -notmatch '-OURSAW$' } | Sort-Object Name)
Log ("Stones in the work folder: " + $stones.Count)
$done = 0; $stopped = $false
foreach ($s in $stones) {
  if ($MaxStones -gt 0 -and $done -ge $MaxStones) { Log ("Reached " + $MaxStones + " stone(s) for this run."); break }
  $base = $s.BaseName
  $jobs = @(
    @{ File = $s.Name; Tag = 'MK'; Cmds = @(42022) },
    @{ File = $s.Name; Tag = 'BP'; Cmds = @(42023) },
    @{ File = $s.Name; Tag = 'BR'; Cmds = @(42023, 42140) },
    @{ File = $s.Name; Tag = 'MP'; Cmds = @(42106) }
  )
  if (Test-Path (Join-Path $StoneFolder ($base + '-OURSAW.adv'))) { $jobs += @{ File = ($base + '-OURSAW.adv'); Tag = 'SAW'; Cmds = @(42021) } }
  Log ($base + ": " + $jobs.Count + " plans")
  foreach ($j in $jobs) {
    $name = $base + '-' + $j.Tag
    if (Test-Path (Join-Path $SaveFolder ($name + '.adv'))) { Log ("  " + $name + ": already saved, skipped"); continue }
    $r = OpenStone $adv $j.File
    if ($r -ne 'ok') { Log ("  STOP: " + $r); $stopped = $true; break }
    Start-Sleep -Seconds 2
    $bad = $false
    foreach ($cmd in $j.Cmds) {
      $before = [AdvResave]::All()
      $t0 = Get-Date
      [AdvResave]::PostMessage($adv, 0x111, [IntPtr]$cmd, [IntPtr]::Zero) | Out-Null
      $w = WaitIdle $proc $before $MaxSeconds
      Log ("  " + $name + " planning " + $cmd + ": " + $w + " after " + [int]((Get-Date) - $t0).TotalSeconds + " s")
      if ($w -ne 'done') { $bad = $true; break }
    }
    if ($bad) { Log '  STOP: planning did not finish cleanly. Send a photo of the screen.'; $stopped = $true; break }
    $copy = Join-Path $StoneFolder $j.File
    $orig = (Get-Item $copy).LastWriteTime
    $r = SaveAs $adv $proc $name
    if ((Get-Item $copy).LastWriteTime -ne $orig) { Log ("  STOP: Advisor wrote over the work copy " + $j.File + ". Prepare it again."); $stopped = $true; break }
    if ($r -ne 'ok') { Log ("  STOP: " + $r); $stopped = $true; break }
    Move-Item -Path (Join-Path $StoneFolder ($name + '.adv')) -Destination (Join-Path $SaveFolder ($name + '.adv'))
    Log ("  saved " + $name + ".adv")
  }
  if ($stopped) { break }
  $done++
}
Log ("Finished. " + $done + " stone(s) done this run.")
[System.Windows.Forms.MessageBox]::Show("Advisor run finished: $done stone(s). Log: advisor-best-plan-log.txt on the Desktop.") | Out-Null
}
