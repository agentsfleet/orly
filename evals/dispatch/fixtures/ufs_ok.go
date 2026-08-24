// Pins the Go lane carve-outs in audits/ufs.sh — remove either and this
// fixture starts failing.
//
//   `const ( ... )`  the binding keyword is stated ONCE, on the opening line,
//                    so every member below it is a definition carrying no
//                    `const` of its own. Two names sharing one value across
//                    two domains is the case the single-line carve-out allows.
//   struct tags      backtick-quoted halves are read by reflection; a const
//                    cannot appear inside one, so no rename can fix a repeat.
package fixture

const (
	runnerActive = "active"
	leaseActive  = "active"
)

type Row struct {
	Name string `json:"repeated_tag_name" yaml:"repeated_tag_name"`
}

func Active(lease bool) string {
	if lease {
		return leaseActive
	}
	return runnerActive
}
