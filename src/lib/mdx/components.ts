/**
 * MDX components map (as on the companion sites). The animations come
 * through `lazy.tsx`, so each chapter loads only its own widget's code;
 * `Eq` renders an equation with KaTeX on the server (pass it as a widget's
 * child); `V` prints a number from the model.
 */
import type { MDXRemoteProps } from "next-mdx-remote/rsc";

import { Layer } from "@/components/interactive/Layer";
import {
  FabricWidget,
  LadderWidget,
  PackageWidget,
  PathWidget,
  RingWidget,
} from "@/components/interactive/lazy";
import { Eq } from "@/components/mdx/Eq";
import { V } from "@/components/mdx/V";
import {
  SpecTable,
  SwitchTable,
  ValidationTable,
} from "@/components/mdx/Tables";
import { Nvl72Diagram } from "@/components/viz/Nvl72Diagram";
import { Callout } from "@/components/ui/Callout";
import { MdxPre, MdxTable } from "@/components/ui/MdxTable";

export const mdxComponents: NonNullable<MDXRemoteProps["components"]> = {
  table: MdxTable,
  pre: MdxPre,
  Layer,
  Callout,
  Eq,
  V,
  Nvl72Diagram,
  SpecTable,
  SwitchTable,
  ValidationTable,
  LadderWidget,
  PackageWidget,
  PathWidget,
  RingWidget,
  FabricWidget,
};
