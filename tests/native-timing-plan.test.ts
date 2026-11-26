import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { getNativeDdrRoutingPlan } from "../circuits/native-ddr-routing-plan";

test("OrangeCrab solves declared cross-byte timing together and selects the clock's main path", () => {
	const source = JSON.parse(
		gunzipSync(
			readFileSync(`${import.meta.dir}/../circuits/orangecrab.json.gz`),
		).toString(),
	);
	const plan = getNativeDdrRoutingPlan({
		source,
		matchLengths: true,
		dataOnly: false,
	});
	expect(plan.phases.map((phase) => phase.connections.length)).toEqual([
		44, 58,
	]);
	for (const name of ["DDR3_DQS0_LM1.0", "DDR3_DQS1_LM1.0"]) {
		const bus = plan.buses.find((bus) => bus.name === name)!;
		expect(bus.maxLengthSkew).toBe(0.999999);
	}
	const interByte = plan.buses.find(
		(bus) => bus.name === "U4 inter-byte DQS (§9.9)",
	)!;
	expect(interByte.maxLengthSkew).toBe(2.54);
	expect(interByte.connections).toHaveLength(4);
	expect(interByte.routingPhaseIndex).toBe(0);
	const clock = source.traces.find(
		(trace: { nativeNet: string }) => trace.nativeNet === "RAM_CK+",
	);
	const mainPath = plan.timingPaths.find(
		(path) => path.name === `DDR_TIMING_${clock.name}`,
	)!;
	expect(mainPath.path).toEqual([
		".U3 > .pin278",
		".U4 > .pin45",
		`net.${clock.name}`,
	]);
	expect(plan.netConnections.get(clock.name)).toHaveLength(1);
	const control = plan.buses.find(
		(bus) => bus.name === "U4 address/command to CK (§9.10)",
	)!;
	expect(control.lengthMatchTo).toContain(mainPath.name);
	expect(control.routingPhaseIndex).toBe(mainPath.routingPhaseIndex);
});
