// Fixture: a <section> already inside the design-system asChild wrapper. The
// runner commits this, then stages an aria-label change to the <section> line
// alone — the wrapper line never appears in the diff, which is why the
// carve-out has to read the source and not the diff.
export function WrappedRegion() {
  return (
    <Section asChild>
      <section aria-label="Pending">
        <Text>rows</Text>
      </section>
    </Section>
  )
}
