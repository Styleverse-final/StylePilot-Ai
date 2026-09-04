// ---------------------------------------------------------------------------
// Shell (owned elsewhere; re-exported here so "@/components" is the one door)
// ---------------------------------------------------------------------------

export { default as PageHeader, useShortcutLabel } from "./PageHeader";
export type { PageHeaderProps, KpiItem, PillTone } from "./PageHeader";

export { default as TopNav } from "./TopNav";
export {
  PRIMARY_NAV,
  SECONDARY_NAV,
  PORTFOLIO_PRIMARY_NAV,
  PORTFOLIO_ROLES,
  navFor,
} from "./navItems";
export type { TopNavProps, NavItem, NavUser } from "./TopNav";

export {
  CopilotDrawer,
  CopilotProvider,
  useCopilot,
  SPARK,
  SUGGESTED_PROMPTS,
} from "./CopilotDrawer";
export type { CopilotContextValue } from "./CopilotDrawer";

export { default as UserChip, initialsFrom } from "./UserChip";
export type { UserChipProps } from "./UserChip";

// ---------------------------------------------------------------------------
// Design-system primitives
// ---------------------------------------------------------------------------

export { Card, CardHeader, CardBody } from "./Card";
export type { CardProps, CardHeaderProps, CardBodyProps } from "./Card";

export { KpiRow, Kpi } from "./KpiRow";
export type { KpiRowProps, KpiProps } from "./KpiRow";

export { Pill } from "./Pill";
export type { PillProps, PillVariant } from "./Pill";

export { Chip, ChipRow } from "./Chip";
export type { ChipProps, ChipRowProps } from "./Chip";

export { Button, ButtonRow, buttonClasses } from "./Button";
export type {
  ButtonProps,
  ButtonRowProps,
  ButtonVariant,
  ButtonSize,
} from "./Button";

export { DataTable, SeriesName } from "./DataTable";
export type {
  DataTableProps,
  Column,
  ColumnAlign,
  SeriesNameProps,
} from "./DataTable";

export { DriverBars, DriverBar, formatUnits, formatUnitsAbs } from "./DriverBars";
export type { DriverBarsProps, DriverBarProps, Driver } from "./DriverBars";

export { ThreadBand } from "./ThreadBand";
export type { ThreadBandProps, ThreadClass } from "./ThreadBand";

export { StatBlock, Stat } from "./StatBlock";
export type { StatBlockProps, StatProps, StatTone } from "./StatBlock";

export { Banner } from "./Banner";
export type { BannerProps, BannerVariant } from "./Banner";

export { AllocBar, AllocBarList } from "./AllocBar";
export type { AllocBarProps, AllocBarListProps, AllocRow } from "./AllocBar";

export { ModelStrip } from "./ModelStrip";
export type { ModelStripProps, ModelConfidence } from "./ModelStrip";

export { RoleGate, roleAllows, type AppRole, type RoleGateProps } from "./RoleGate";

export { AccuracyStatement, type AccuracyStatementProps } from "./AccuracyStatement";
