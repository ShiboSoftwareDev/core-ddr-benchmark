import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { getDdrReference } from "../circuits/ddr-constraints";
import { getDirectDdrTimingBuses } from "../circuits/direct-ddr-timing";
import { planDirectDdrPhases } from "../circuits/direct-ddr-phases";

test("H616 routes exact source limits and clock endpoint paths before their dependents", (): void => {
	const source = JSON.parse(
		gunzipSync(
			readFileSync(`${import.meta.dir}/../circuits/h616.json.gz`),
		).toString(),
	);
	const original = structuredClone(source);
	const buses = getDirectDdrTimingBuses(source)!;
	const required = getDdrReference("h616").constraints!.filter(
		(constraint) => (constraint.severity ?? "error") === "error",
	);
	for (const constraint of required) {
		const bus = buses.find((bus) => bus.name === constraint.name)!;
		expect(bus.maxLengthSkew).toBe(constraint.maxLengthSkew);
		expect(bus.minLength).toBe(constraint.minLength);
		expect(bus.maxLength).toBe(constraint.maxLength);
		expect(bus.skewReference ?? "range").toBe(
			constraint.skewReference ?? "range",
		);
	}
	const clock = buses.find(
		(bus) => bus.name === "U2 clock pair (original matching)",
	)!;
	expect(clock.lengthMatchingPaths).toHaveLength(2);
	for (const [from, to] of clock.lengthMatchingPaths!) {
		expect(from).toStartWith(".U1 > ");
		expect(to).toStartWith(".U2 > ");
	}
	const plan = planDirectDdrPhases(source.traces, buses);
	expect(plan.phases.indexOf(plan.busPhases.get(clock.name)!)).toBeLessThan(
		plan.phases.indexOf(
			plan.busPhases.get("U2 address/command to CK (original matching)")!,
		),
	);
	expect(source).toEqual(original);
});
