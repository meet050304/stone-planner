# Optimizer architecture and benchmark method (proposal, revised 3 Nov 2026)

Two separate goals: (1) the strongest optimizer we can build with our own geometry, inclusion rules and search; (2) every result benchmarked against Advisor's saved plans. Advisor is the yardstick, not the template. The overall direction is approved; this document is updated before any implementation. Production code is not changed until the implementation is approved.

## 1. Optimizer architecture

**Shared exact core (one copy, used by everything)**
- Geometry: rough model, stone shape from Cut limits, saw plates with their thickness, the fit check (with the inclusion point grid).
- Inclusion rules: our Auto select only. Advisor's manual changes never enter our results.
- Pricing model: one configurable price table (rates per size band, blocked sizes, polishing loss, labour per stone), stored with every run. The same model prices our plans and Advisor's plans in every comparison; changing the model re-prices both.
- Final check: rough outline, saw faces and every original inclusion point, with a recorded reason when a stone fails.

**Stone counts**
- 1, 2 and 3 stones at first. Plans are stored as a list of stones and a list of saws (each saw with the part it divides), so 4 or more stones can be added later without changing the plan format, the final check, pricing, selection or the benchmark. Only the generators need to support a new count.

**Candidate generators (each produces complete plans in one common format)**
1. Saw first (current production beam search).
2. Stones first, best pair, best remainder, big stone first (current production).
3. Saw sweep with free stone orientation (experimental).
4. Facet-aligned: stones standing on the saw with the table flat or a pavilion facet flat (experimental).
5. Single stone.
Each generator has a fixed time budget and is judged only on the plans it returns, so a new idea can be added or removed without touching the others.

**Pavilion-flat geometry: investigation before use**
The current pavilion-flat placement is not assumed correct. On 276 it lost to table-flat and fell far below Advisor, whose stones there lie pavilion-flat. To be investigated on 276, 256 and 206, using Advisor's own stones as test cases:
- Place each Advisor stone in our model at its saved position, axis and spin and measure: the angle between its nearest pavilion facet and the saw, the gap between that facet and the saw face, and whether our fit check accepts it at full size.
- Check our pavilion model: the fit check uses a round outline (a cone through the facet tips), so a flat facet on the saw may be rejected by the cone a few µm away; and our stones have no spin, so a facet can only lie flat for certain directions.
- Compare our standing distance (stone centre to saw face) with Advisor's for the same stone.
- Only then fix: exact facet planes against the saw (and spin if it proves necessary), tested again on the same three stones before any sweep.

**Shared refinement**
- The best plans from every generator (not just the overall best, so one generator cannot crowd out the rest) are refined.
- Three candidate pools are kept and refined separately: highest weight, highest value and highest profit. Each pool keeps its own best plans and is judged by its own measure during refinement (weight by polished carats, value by selling value, profit by value less labour), so refinement never narrows to weight alone.
- Moves: small saw moves and stone moves; aligned stones move along the saw and keep their alignment; free stones move freely.

**Finish and selection**
- Every refined plan is finally checked, then priced with the pricing model: each stone at full size or held below the blocked sizes, whichever earns more for the profit and value pools; the weight pool keeps full sizes.
- For each stone count, three plans are kept and reported separately: highest weight, highest value, highest profit. The plate-count rule (fewer plates unless the extra plate earns clearly more) applies to the profit choice only.
- All plans keep their diagnostics: generator, pool, saw, stone centres and axes, orientation, sizes, weights, value, profit, fit counts, time.

**Running**
- Worker pool across all cores, fixed random seeds per task.

## 2. Benchmark method

**Dataset**
- The 196 autook stones with saved Advisor plans. Advisor's references are copied once into read-only files (stones, saws, marks); the .adv files are never changed.
- Split fixed in a file, spread by rough row (0.02-0.10 ct), Advisor stone count (1/2/3) and rough shape: development about 100, validation about 50, test about 46.
- Development: all design work and tuning. Validation: checking changes. Test: not run at all until the design and development tuning are complete and agreed; then run once per agreed final version.

**Two runs per stone, same everything else**
- Primary: our Auto select (the real product result).
- Diagnostic: Advisor's saved marks (shows whether a gap is search or inclusion choice).
- Manual overrides: inclusions Advisor kept inside its stones that our rules would block are listed per stone as overrides, with size, depth and our rule; they explain gaps but never change our rules.

**Recorded per stone**
- Advisor plan and our three champions (weight, value, profit) for each stone count: stone diameters, carats, value, profit, saw position and angle, stone centres and axes, orientation (table-flat, pavilion-flat, free).
- Differences to Advisor in µm, degrees, ct, Rs and %; whether an Advisor saw was found (within 5° and 60 µm); inclusion marks that differ and which are overrides; failures and reasons; run time; the pricing model used.

**Summary per run**
- Weight, value and profit reported independently: mean and median difference to Advisor and to current production; stones where we win, tie (within 1%) or lose.
- Saw-found rate, geometry match rate (saw within 5° and 60 µm, stones within 50 µm and 5°), orientation counts.
- The same figures split by rough row and Advisor stone count.
- Versioned: every run is saved under its algorithm version, settings and pricing model, with a backup of the code.

**Reproducibility check**
- Every benchmark run includes a repeat of a fixed set of stones (for example 5 development stones, all stone counts) with identical settings. The repeat must give identical results: same plans, sizes, centres, axes and saws to the micrometre, and the same fit counts. Any difference stops the run and is investigated before results are used.

**Promotion rule**
A new version replaces production only if, on the validation set with our Auto select, all of the following hold:
1. No invalid final plans (every stone passes the final check).
2. No regression in total profit against current production.
3. At least 90% of validation stones earn at least as much as current production.
4. Runtime per stone stays within an agreed limit (to be set before the first comparison).
5. The reproducibility check passes.
Weight, value and profit are reported independently for the decision; the profit criteria above are the gate, and weight and value are shown alongside so a profit gain bought with a large weight loss is visible.
