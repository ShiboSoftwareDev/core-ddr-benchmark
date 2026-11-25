import type { DirectDdrBus } from "./direct-ddr-timing";

type TraceName = string;
type CohortId = TraceName;
type PhaseName = string;
type Trace = { name: TraceName; path: string[]; group: string };

function cohort(parent: Map<CohortId, CohortId>, name: CohortId): CohortId {
	let root = name;
	while (parent.get(root) !== root) root = parent.get(root)!;
	return root;
}

/** Symmetric constraints share a solve. References between those cohorts route
 * first, so later comparisons use actual completed copper, including branches. */
export function planDirectDdrPhases(
	traces: Trace[],
	buses: DirectDdrBus[],
): {
	phases: PhaseName[];
	tracePhases: Map<TraceName, PhaseName>;
	busPhases: Map<string, PhaseName>;
	busRoutingPhases: Set<PhaseName>;
} {
	const parent = new Map(traces.map((trace) => [trace.name, trace.name]));
	const selectorOwners = new Map(
		traces.flatMap((trace) =>
			trace.path.map((selector) => [selector, trace.name] as const),
		),
	);
	const members = buses.map((bus) =>
		bus.connections.map((selector) => selectorOwners.get(selector)!),
	);
	for (const names of members) {
		for (const name of names)
			parent.set(cohort(parent, name), cohort(parent, names[0]));
	}
	const groups = new Map<CohortId, Trace[]>();
	for (const trace of traces) {
		const root = cohort(parent, trace.name);
		const group = groups.get(root) ?? [];
		group.push(trace);
		groups.set(root, group);
	}
	const dependencies = new Map<CohortId, Set<CohortId>>(
		[...groups.keys()].map((root) => [root, new Set()]),
	);
	for (const [index, bus] of buses.entries()) {
		const root = cohort(parent, members[index][0]);
		for (const selector of bus.lengthMatchTo ?? []) {
			const reference = cohort(parent, selectorOwners.get(selector)!);
			if (root !== reference) dependencies.get(root)!.add(reference);
		}
	}
	const phases: PhaseName[] = [];
	const tracePhases = new Map<TraceName, PhaseName>();
	const busPhases = new Map<string, PhaseName>();
	const busRoutingPhases = new Set<PhaseName>();
	const routed = new Set<CohortId>();
	while (routed.size < groups.size) {
		const ready = [...groups.keys()].find(
			(root) =>
				!routed.has(root) &&
				[...dependencies.get(root)!].every((reference) =>
					routed.has(reference),
				),
		);
		if (ready === undefined)
			throw new Error(
				"DDR timing references contain a cycle across routing cohorts",
			);
		const ownedBuses = buses.filter(
			(_, index) => cohort(parent, members[index][0]) === ready,
		);
		let name = `remaining_${phases.length}`;
		if (ownedBuses.length)
			name = `match_${ownedBuses[0].name.replace(/\W/g, "_")}`;
		phases.push(name);
		for (const trace of groups.get(ready)!) tracePhases.set(trace.name, name);
		for (const bus of ownedBuses) busPhases.set(bus.name, name);
		if (ownedBuses.length) busRoutingPhases.add(name);
		routed.add(ready);
	}
	return { phases, tracePhases, busPhases, busRoutingPhases };
}
