// ─── Retail Module – Public API ───────────────────────────────────────────────
export { RetailRuleEngine } from './RetailRuleEngine';
export { RetailDimensionWeights } from './RetailDimensionWeights';
export { buildRetailSnapshot } from './RetailSnapshotBuilder';
export type {
  NormalizedRetailSnapshot,
  RetailDimensionResult,
  RetailDimensionKey,
  RetailRiskLevel,
  RetailRiskScore,
  FormField,
  SelectField,
  SelectOption,
  RadioGroup,
  InputField,
  ImageItem,
  AnchorItem,
} from './RetailTypes';
