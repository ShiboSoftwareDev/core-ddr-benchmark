import { expect, test } from "bun:test"
import { getSourceSkewAudit } from "../scripts/source-skew"
import manifest from "../manifest.json"

test("source constraints retain exact scopes, malformed rules, and active tuning modes", () => {
  for (const circuit of manifest.circuits) {
    const audit = getSourceSkewAudit(circuit.id)
    expect(audit.repo).toBe(circuit.source.repo)
    expect(audit.commit).toBe(circuit.source.commit)
    expect(audit.files.find((file) => file.path === circuit.source.path)?.sha256).toBe(circuit.source.sourceSha256)
    expect(audit.files.some((file) => /\.(pro|kicad_pro)$/.test(file.path))).toBe(true)
    if ("projectSha256" in circuit.source) expect(audit.files.find((file) => file.path.endsWith(".kicad_pro"))?.sha256).toBe(circuit.source.projectSha256)
    const projectSource = "projectSource" in circuit.source ? circuit.source.projectSource : undefined
    if (projectSource) expect(audit.files.find((file) => file.path === projectSource.path)?.sha256).toBe(projectSource.sha256)
  }
  for (const circuit of ["h3", "a64", "stmp157", "orangecrab", "butterstick"]) {
    const audit = getSourceSkewAudit(circuit)
    expect(audit.status).toBe("no_numeric_targets")
    expect(audit.constraints).toHaveLength(0)
    expect(audit.tuningPatterns).toHaveLength(0)
  }
  const h616 = getSourceSkewAudit("h616")
  expect(h616.constraints.map((rule) => rule.bounds.max)).toEqual(["6.35mm", "2.54mm", "2.54mm", "4.445mm", "4.445mm", "3.175mm"])
  expect(h616.constraints.filter((rule) => rule.status === "invalid_condition")).toHaveLength(3)
  expect(h616.constraints[1].condition).toBe("A.NetClass == 'DDR3_DATA_LB'")
  const imx6 = getSourceSkewAudit("imx6")
  expect(imx6.constraints.map((rule) => rule.bounds)).toEqual([
    { min: "44.0mm", max: "44.5mm" }, { min: "36.5mm", max: "37.0mm" },
    { min: "45.0mm", max: "46.0mm" }, { max: "0.1mm" },
  ])
  expect(imx6.constraints[3].condition).toBe("A.inDiffPair('DRAM_DQSL')")
  const a13 = getSourceSkewAudit("a13")
  expect(a13.tuningPatterns).toHaveLength(1)
  expect(a13.tuningPatterns[0].net).toBe("/DDR3 Memory/ddr-d2")
  expect(a13.tuningPatterns[0].fields.tuning_mode).toBe("single")
  expect(a13.tuningPatterns[0].fields.target_length).toBe("24.84")
  expect(a13.constraints).toHaveLength(0)
  expect(getSourceSkewAudit("glider").tuningPatterns).toHaveLength(48)
  expect(getSourceSkewAudit("icepi").tuningPatterns).toHaveLength(67)
})
