/**
 * Permutation generator for flow steps
 * Uses Heap's algorithm to generate all permutations
 */
import { FlowStep, FlowPermutation } from "@/types/flow";
import { v4 as uuidv4 } from "uuid";
import { STEP_LABELS } from "./definition";

/**
 * Generate all permutations of an array using Heap's algorithm
 * For n items, this produces n! permutations
 */
export function generatePermutationsArray<T>(items: T[]): T[][] {
  const result: T[][] = [];
  const arr = [...items];
  const n = arr.length;

  // Heap's algorithm
  const c = new Array(n).fill(0);

  result.push([...arr]);

  let i = 0;
  while (i < n) {
    if (c[i] < i) {
      if (i % 2 === 0) {
        // Swap arr[0] and arr[i]
        [arr[0], arr[i]] = [arr[i], arr[0]];
      } else {
        // Swap arr[c[i]] and arr[i]
        [arr[c[i]], arr[i]] = [arr[i], arr[c[i]]];
      }
      result.push([...arr]);
      c[i]++;
      i = 0;
    } else {
      c[i] = 0;
      i++;
    }
  }

  return result;
}

/**
 * Generate all permutations of flow steps
 */
export function generateFlowPermutations(steps: FlowStep[]): FlowPermutation[] {
  const stepIds = steps.map((s) => s.id);
  const stepNames = steps.map((s) => s.name);
  const permutations = generatePermutationsArray(
    steps.map((_, i) => i)
  );

  return permutations.map((indices) => {
    const orderedStepIds = indices.map((i) => stepIds[i]);
    const orderedStepNames = indices.map((i) => stepNames[i]);

    // Create label like "A->B->C"
    const label = orderedStepNames
      .map((name) => STEP_LABELS[name] || name.charAt(0).toUpperCase())
      .join("->");

    return {
      id: uuidv4(),
      stepOrder: orderedStepIds,
      label,
    };
  });
}

/**
 * Generate permutations with step names for display
 */
export function generatePermutationsWithNames(
  steps: FlowStep[]
): { permutation: FlowPermutation; stepNames: string[] }[] {
  const permutations = generateFlowPermutations(steps);
  const stepMap = new Map(steps.map((s) => [s.id, s.name]));

  return permutations.map((perm) => ({
    permutation: perm,
    stepNames: perm.stepOrder.map((id) => stepMap.get(id) || id),
  }));
}

/**
 * Get a specific subset of permutations by their labels
 */
export function filterPermutationsByLabels(
  permutations: FlowPermutation[],
  labels: string[]
): FlowPermutation[] {
  const labelSet = new Set(labels.map((l) => l.toUpperCase().replace(/->/g, "->")));
  return permutations.filter((p) => labelSet.has(p.label.toUpperCase()));
}

/**
 * Get permutation count for n items (n factorial)
 */
export function getPermutationCount(n: number): number {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}
