// Pulls in the custom matchers (`toBeInTheDocument`, ...) that jest.setup.js
// registers at runtime, so `tsc --noEmit` sees them too.
import '@testing-library/jest-dom'
