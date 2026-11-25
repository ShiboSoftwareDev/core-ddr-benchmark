import originalBoards from "./ddr-skew-reference.json";
import { getDdrReference } from "./ddr-constraints";
import {
	getDdrNetEndpoints,
	getDdrSkewGroupNames,
	getDdrSkewGroups,
} from "./ddr-signals";

type TraceName = string;
type NetName = string;
type PortSelector = string;
type Source = Omit<Parameters<typeof getDdrSkewGroups>[0], "traces"> & {
	traces: {
		name: TraceName;
		nativeNet: NetName;
		path: PortSelector[];
		group: string;
	}[];
};
type MatchingGroupName = ReturnType<typeof getDdrSkewGroups>[number]["name"];
type OriginalLengthWindow = {
	minLengthMm: number | null;
	maxLengthMm: number | null;
};

export interface DirectDdrBus {
	name: string;
	group: string;
	connections: PortSelector[];
	maxLengthSkew?: number;
	minLength?: number;
	maxLength?: number;
	skewReference?: "range" | "mean" | "references";
	lengthMatchTo?: PortSelector[];
	lengthMatchingPaths?: [PortSelector, PortSelector][];
}

/** Carry original numeric requirements directly. A series-resistor sum or a
 * multi-memory endpoint model still needs its existing specialized adapter. */
export function getDirectDdrTimingBuses(source: Source): DirectDdrBus[] | null {
	if (getDdrSkewGroupNames(source.id).length !== 6) return null;
	const groups = getDdrSkewGroups(source);
	for (const group of groups) {
		if (group.signals.some((signal) => signal.sections.length !== 1))
			return null;
	}
	const required = (getDdrReference(source.id).constraints ?? []).filter(
		(constraint) => (constraint.severity ?? "error") === "error",
	);
	if (
		required.some(
			(constraint) =>
				constraint.skewReference !== undefined &&
				!["mean", "references"].includes(constraint.skewReference),
		)
	)
		return null;
	const byNet = new Map(source.traces.map((trace) => [trace.nativeNet, trace]));
	for (const constraint of required) {
		if (constraint.nets.some((net) => !byNet.has(net))) return null;
	}
	const buses: DirectDdrBus[] = [];
	for (const constraint of required) {
		const referenceNets = new Set(constraint.referenceNets ?? []);
		const members = constraint.nets
			.filter((net) => !referenceNets.has(net))
			.map((net) => byNet.get(net)!);
		if (!members.length) continue;
		const bus: DirectDdrBus = {
			name: constraint.name,
			group: members[0].group,
			connections: members.map(
				(trace) => getDdrNetEndpoints(source, trace, constraint.memoryRef)[0],
			),
		};
		if (constraint.minLength !== undefined)
			bus.minLength = constraint.minLength;
		if (constraint.maxLength !== undefined)
			bus.maxLength = constraint.maxLength;
		if (constraint.maxLengthSkew !== undefined)
			bus.maxLengthSkew = constraint.maxLengthSkew;
		if (constraint.skewReference === "mean") bus.skewReference = "mean";
		if (constraint.skewReference === "references") {
			bus.skewReference = "references";
			bus.lengthMatchTo = [...referenceNets].map(
				(net) =>
					getDdrNetEndpoints(source, byNet.get(net)!, constraint.memoryRef)[0],
			);
		}
		const paths = constraint.nets
			.map((net) => byNet.get(net)!)
			.filter((trace) => trace.path.length > 2)
			.map((trace) => getDdrNetEndpoints(source, trace, constraint.memoryRef));
		if (paths.length) bus.lengthMatchingPaths = paths;
		buses.push(bus);
	}
	const original =
		(
			originalBoards as Record<
				Source["id"],
				{
					groups: Record<MatchingGroupName, OriginalLengthWindow>;
				}
			>
		)[source.id]?.groups ?? {};
	for (const group of groups) {
		const window = original[group.name];
		if (window?.minLengthMm == null || window.maxLengthMm == null) continue;
		const members = group.signals.map((signal) => byNet.get(signal.name)!);
		if (members.some((member) => !member)) return null;
		const bus: DirectDdrBus = {
			name: `DDR_original_${group.name.replace(/\W/g, "_")}`,
			group: members[0].group,
			connections: members.map((trace) => getDdrNetEndpoints(source, trace)[0]),
			maxLengthSkew: window.maxLengthMm - window.minLengthMm + 0.000001,
		};
		const paths = members
			.filter((trace) => trace.path.length > 2)
			.map((trace) => getDdrNetEndpoints(source, trace));
		if (paths.length) bus.lengthMatchingPaths = paths;
		buses.push(bus);
	}
	return buses;
}
