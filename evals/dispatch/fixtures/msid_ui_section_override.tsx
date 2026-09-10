// Fixture: an unwrapped <section> carrying the UI GATE override comment above
// it in committed source. An override covers the line it sits above for as long
// as it sits there, not only in the diff that introduced it.
export function OverriddenRegion() {
  return (
    <Box>
      {/* UI GATE: SKIPPED per user override (reason: fixture for the override recognizer) */}
      <section aria-label="Pending">
        <Text>rows</Text>
      </section>
    </Box>
  )
}
