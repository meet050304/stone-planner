# Full auto Bulk plan: brief for Claude Code on the Advisor PC

Read this, then `CLAUDE.md`, `HANDOFF.md` and the end of `ADVISOR-NOTES.md`. Speak to the user in plain, short language.

## Aim
Give Bulk plan a Stone folder, an Output folder and the inclusion choice. Every stone ends in the Output folder as `[stone].adv`,
with the most profitable plan that could be written, and it opens in Advisor.

## How it runs
1. Viewer, Chrome on this PC: `adv-viewer.html`, **Bulk plan**. It plans stones three at a time. A plan that fits the stone's file
   is written at once. For the others it writes `[stone].plan.json`, puts the best plan the file can hold in `[stone].adv`,
   then writes `resave-needed.csv` to the Output folder and waits.
2. This PC: `advisor-automation\advisor-resave-all.bat`, started before or after step 1. It waits for the list, then opens each
   stone, plans the count (1 Makeable, 2 Best Pair, 3 Best Pair then Best Remainder), and saves `[stone]-ADV[count].adv` to
   `[Output]\advisor-resaves`. When done it writes `resave-done.txt` there.
3. Viewer, nothing to press: each save is seen within about 30 seconds, checked, and our plan is written over `[stone].adv` in
   the Output folder. `bulk-compare.csv` is updated. The report line ends with Finished.
Keep the viewer tab open. Advisor works on one stone at a time on this PC; only the planning in step 1 runs at once.

## First: set the folders at the top of advisor-resave-all.ps1
`$SourceFolder` is the Stone folder of Bulk plan. `$OutputFolder` is its Output folder. `$StoneFolder` is a work folder; set Load
Stone to it by hand once. Bulk plan's Export folder is separate.

## Your job: prove it on 2 or 3 stones first
It has never run on Advisor. The viewer side was tested on the Mac with stand-in saves. Keep watch for the first stones.
- If `advisor-best-plan.ps1` on this PC was fixed while proving the Advisor run, make the same fixes here. Compare first.
- Does the title test pass? The title can show a stored name that differs from the file, so any new title counts.
- A stone that fails is skipped: windows of Advisor left open are closed as if by the X, no button is pressed. Log what each
  window said. If a window is a question that needs an answer, stop and show the user.
- Three stones failing in a row stops the run. `resave-done.txt` is still written, so the viewer finishes.
- Selection: the user says Advisor selects the stones by itself after Makeable, Best Pair and Best Pair + Best Remainder, and Save As
  saves the selected result. So no select step. Do not change the option. The viewer still refuses a save with the wrong count.
- Then open some results in Advisor: Polish > Inclusion Projection, no hatched patch, and the stone count shown.
Do not run all stones until the user says so.

## Rules (must keep)
- Only Save As, into the work folder, then move to the Output folder. Keep originals unchanged. Never plain Save (42040).
- Never use Help > License, Tools > Allow Full Access, Tools > Options or proxy settings. Do not open the Authorization tab.
  Do not change Rough Skin or any other Advisor setting.
- Do not decompile, disassemble or open Advisor's program files. If the user shows you any such output, do not use it.
- Results are not for marking, sawing or polishing until tested on a real low-value stone and approved in writing.
- Do not send Sarine crash reports. Do not upload or copy customer stone files anywhere.

## Report back
Add dated findings to `ADVISOR-NOTES.md`, a short line to `PROGRESS.md`. Say plainly what was not verified.
