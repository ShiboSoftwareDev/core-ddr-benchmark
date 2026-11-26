import type { IcePiPad } from "./icepi-sbc-source"

/** KiCad pad centers in footprint-local mm, +X right, +Y up, with board rotation already applied. */
export function IcePiSbcPad({ pad }: { pad: IcePiPad }) {
  const placement = { pcbX: pad.x, pcbY: pad.y }
  if (pad.kind === "paste_only") {
    return (
      <solderpaste
        {...placement}
        layer="top"
        pcbRotation={pad.ccwRotationDegrees}
        shape="rect"
        width={pad.width}
        height={pad.height}
      />
    )
  }
  if (pad.kind === "np_thru_hole") {
    return <hole {...placement} diameter={pad.holeWidth} />
  }
  const copper = {
    ...placement,
    portHints: pad.pin ? [pad.pin] : [],
    noSolderPaste: !pad.hasPaste,
    coveredWithSolderMask: !pad.hasMaskOpening,
  }
  if (pad.kind === "thru_hole") {
    if (pad.shape === "circle") {
      return (
        <platedhole
          {...copper}
          shape="circle"
          holeDiameter={pad.holeWidth}
          outerDiameter={pad.width}
        />
      )
    }
    if (pad.shape === "oval") {
      return (
        <platedhole
          {...copper}
          pcbRotation={pad.ccwRotationDegrees}
          shape="pill"
          holeWidth={pad.holeWidth}
          holeHeight={pad.holeHeight}
          outerWidth={pad.width}
          outerHeight={pad.height}
        />
      )
    }
    return (
      <platedhole
        {...copper}
        pcbRotation={pad.ccwRotationDegrees}
        shape="circular_hole_with_rect_pad"
        holeDiameter={pad.holeWidth}
        rectPadWidth={pad.width}
        rectPadHeight={pad.height}
        rectBorderRadius={pad.roundRadius}
      />
    )
  }
  if (pad.shape === "circle")
    return <smtpad {...copper} shape="circle" radius={pad.width / 2} />
  if (pad.shape === "oval") {
    return (
      <smtpad
        {...copper}
        shape="rotated_pill"
        ccwRotation={pad.ccwRotationDegrees}
        radius={Math.min(pad.width, pad.height) / 2}
        width={pad.width}
        height={pad.height}
      />
    )
  }
  if (pad.ccwRotationDegrees % 90 !== 0) {
    return (
      <smtpad
        {...copper}
        shape="rotated_rect"
        ccwRotation={pad.ccwRotationDegrees}
        width={pad.width}
        height={pad.height}
        cornerRadius={pad.roundRadius}
      />
    )
  }
  const quarterTurn = pad.ccwRotationDegrees % 180 !== 0
  return (
    <smtpad
      {...copper}
      shape="rect"
      width={quarterTurn ? pad.height : pad.width}
      height={quarterTurn ? pad.width : pad.height}
      cornerRadius={pad.roundRadius}
    />
  )
}
