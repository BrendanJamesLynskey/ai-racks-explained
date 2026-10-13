/**
 * The chapters that follow (brief 31B): listed on the home and /learn pages
 * as "coming", without links, until they exist.
 */
export const PLANNED = [
  "Power: rack power, shelves, busbars, tokens per megawatt",
  "Cooling: air limits, direct liquid cooling, CDUs, facility water",
  "Disaggregated inference on racks: prefill and decode pools, KV-cache transfer, driven by the Disaggregated_Inference_Sim",
  "Training clusters: parallelism mapped onto racks and pods, failure domains",
  "Other designs: TPU pods, other vendors' rack-scale systems",
  "Cost: capex, opex and cost per token",
] as const;
