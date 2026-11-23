import type { BusProps } from "@tscircuit/props"
import references from "./reference-routing-options.json"

export type ReferenceLengthOptions = Pick<BusProps, "minLength" | "maxLength">
export type ReferenceRoutingOptions = {
  netOptions?: Record<string, ReferenceLengthOptions>
  pairOptions?: { name: string; nets: string[]; maxLengthSkew?: BusProps["maxLengthSkew"] }[]
  notes?: string[]
}

export function getReferenceRoutingOptions(circuit: string): ReferenceRoutingOptions {
  return (references as Record<string, ReferenceRoutingOptions>)[circuit] ?? {}
}

/** Each native connection belongs to one bus, grouped by its actual options. */
export function getReferenceBusGroups(nets: string[], reference: ReferenceRoutingOptions) {
  const groups = new Map<string, { nets: string[]; options: ReferenceLengthOptions }>()
  for (const net of nets) {
    const options = reference.netOptions?.[net] ?? {}
    const key = JSON.stringify(options)
    const group = groups.get(key)
    if (group) group.nets.push(net)
    else groups.set(key, { nets: [net], options })
  }
  return [...groups.values()]
}

/** Apply a shared option only when the reference supplies it for every member.
 * Other referenced members retain their own optional per-net bounds.
 */
export function getSharedReferenceLengthOptions(
  nets: string[],
  reference: ReferenceRoutingOptions,
): ReferenceLengthOptions {
  if (!nets.length) return {}
  const options = nets.map((net) => reference.netOptions?.[net])
  if (options.some((option) => !option)) return {}
  const shared: ReferenceLengthOptions = {}
  for (const property of ["minLength", "maxLength"] as const) {
    const value = options[0]?.[property]
    if (value !== undefined && options.every((option) => option?.[property] === value)) shared[property] = value
  }
  return shared
}
