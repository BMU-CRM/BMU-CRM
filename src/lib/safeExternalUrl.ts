// Forms only accept web addresses, but data can also arrive through the API. Checking
// again here stops a javascript: address ever becoming a clickable link.
export function safeExternalUrl(value: string | null) {
  return value && /^https?:\/\//i.test(value) ? value : null;
}
