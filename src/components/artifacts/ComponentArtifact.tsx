"use client";

import type { ComponentBlock } from "@/artifacts/protocol";
import { REGISTRY, isRegistryName } from "@/components/registry";
import { ArtifactError } from "./ArtifactCard";

/** Look up a registry component by name and zod-validate its props before rendering. */
export function ComponentArtifact({ block }: { block: ComponentBlock }) {
  if (block.props === null) {
    return <ArtifactError message="the component's data wasn't valid JSON." detail={block.propsError} />;
  }
  if (!isRegistryName(block.name)) {
    return <ArtifactError message={`no registry component named "${block.name}".`} />;
  }
  const { Component, schema } = REGISTRY[block.name];
  const parsed = schema.safeParse(block.props);
  if (!parsed.success) {
    return (
      <ArtifactError
        message={`the data didn't match ${block.name}.`}
        detail={parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("\n")}
      />
    );
  }
  return <Component props={parsed.data} />;
}
