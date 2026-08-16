import * as React from "react"

const MOBILE_BREAKPOINT = 768
const FORCE_DESKTOP_KEY = "force_desktop_view"

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(undefined)
  const [forceDesktop, setForceDesktop] = React.useState(
    () => sessionStorage.getItem(FORCE_DESKTOP_KEY) === "true"
  )

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange);
  }, [])

  return forceDesktop ? false : !!isMobile
}

export function useForceDesktop() {
  const [forceDesktop, setForceDesktopState] = React.useState(
    () => sessionStorage.getItem(FORCE_DESKTOP_KEY) === "true"
  )

  const setForceDesktop = (val) => {
    sessionStorage.setItem(FORCE_DESKTOP_KEY, String(val))
    setForceDesktopState(val)
    // Reload so useIsMobile re-evaluates across the app
    window.location.reload()
  }

  return [forceDesktop, setForceDesktop]
}