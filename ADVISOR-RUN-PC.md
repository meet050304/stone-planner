# Advisor run: brief for Claude Code on the Advisor PC

Read this, then `CLAUDE.md`, `HANDOFF.md`, and the end of `ADVISOR-NOTES.md`. Speak to the user in plain, short language:
they work in diamonds and are not a programmer.

## Aim
Advisor makes the final plans, so every stone obeys Advisor's rules (5 um rough skin, pits) and shows no hatched patch.
Our planner only decides: inclusion choices and a saw. We then keep the save that earns the most.

## The three steps
1. In the viewer (`adv-viewer.html`, Chrome): button **Advisor run**, then **1 Prepare copies**. Takes stones spread through
   the Stone folder, writes `[stone].adv` (our inclusion states only) and, where it fits, `[stone]-OURSAW.adv` (our saw) to the
   Work folder, plus `advisor-prepare.json`.
2. On this PC: `advisor-automation\advisor-best-plan.bat`. Opens each copy fresh for each plan and saves to the Saves folder:
   `-MK` Makeable (42022), `-BP` Best Pair (42023), `-BR` Best Pair then Best Remainder (42023, 42140), `-MP` MultiPlan (42106),
   `-SAW` Planning > Both (42021) on the OURSAW copy.
3. In the viewer: **3 Pick the best**. Reads each save, prices it, copies the winner to the Final folder as `[stone].adv`, and
   writes `advisor-best.csv`.

Folders: Stone `F:\autook\401-500`, Work `F:\autook\adv-work`, Saves `F:\autook\adv-saves`, Final `F:\autook\adv-final`.

## Your job: prove step 2, one plan at a time
It has never run. `$MaxStones` starts at 1. Stay with the user for the first stone, and check these first:
- **42021 Both is not proven.** The id came from the brief, not from our tests. Confirm it from the Planning menu by hand or
  with the user before relying on it. If it is wrong, fix the id. Do not guess other ids: an unknown id could trigger anything.
- **42106 MultiPlan:** does it finish without a window asking something? Does it leave stones selected?
- **Selection:** Save As writes only the selected stones. After each plan, check in the saved file (viewer, or the Stone count in
  `advisor-best.csv`) that all stones were saved. The script does not select stones itself: if a plan needs it, find a safe way
  and add it. The Results list may have a select-all button (not confirmed); ask the user before clicking anything there.
- **Opening again after Save As:** does Advisor ask about unsaved changes? The script stops if a window opens. Then add the
  smallest fix, and check what the question says first.
- **Saw copy:** does Advisor open `-OURSAW` without an error, and does Both keep our saw?
- **Patches:** open the winner in Polish > Inclusion Projection and confirm there is no hatched patch.
Then run 10 stones, compare Advisor alone, our planner alone and the automated best, and report. Do not run all stones until
the user says so.

## Rules (must keep)
- Only Save As into the work and saves folders. Keep originals unchanged. Never plain Save (42040).
- Never use Help > License, Tools > Allow Full Access, Tools > Options or proxy settings. Do not open the Authorization tab.
  Do not change Rough Skin or any other Advisor setting.
- Do not decompile, disassemble or open Advisor's program files (exe, dll). If the user shows you any such output, do not use it.
- Results are not for marking, sawing or polishing until tested on a real low-value stone and approved in writing.
- Do not send Sarine crash reports. Do not upload or copy customer stone files anywhere.

## Report back
Add dated findings to `ADVISOR-NOTES.md`, a short line to `PROGRESS.md`, and keep `advisor-automation\advisor-best-plan.ps1` as
the working version. Say plainly what was not verified.
