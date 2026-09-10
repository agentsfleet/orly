// Fixture: the same edit to a <section> with no design-system wrapper above
// it. Proves the source-adjacency carve-out narrowed to the wrapper rather than
// exempting every already-committed raw element.
export function BareRegion() {
  return (
    <Box>
      <section aria-label="Pending">
        <Text>rows</Text>
      </section>
    </Box>
  )
}
