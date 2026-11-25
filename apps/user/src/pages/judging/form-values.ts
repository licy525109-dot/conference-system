// uni-app delivers form fields in event.detail on H5 and on native targets.
export function submittedValues(event: Event): Record<string, string> {
  return (event as CustomEvent<{ value: Record<string, string> }>).detail.value;
}
