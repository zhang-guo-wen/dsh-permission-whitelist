/**
 * CSS-module typings for the client build face.
 * Each `.module.css` default export is its class map.
 */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}