const LOGO_ASPECT = 791 / 165 // natural SVG dimensions

export default function Logo({ height = 26 }) {
  return (
    <div
      role="img"
      aria-label="Seshwars"
      style={{
        height,
        width: height * LOGO_ASPECT,
        backgroundColor: '#d4785a',
        WebkitMaskImage: 'url(https://cdn.prod.website-files.com/6476a2c54e355f0af958e180/69f92fc45b852e5e158d0538_Sesh-Wars-Logo.svg)',
        maskImage: 'url(https://cdn.prod.website-files.com/6476a2c54e355f0af958e180/69f92fc45b852e5e158d0538_Sesh-Wars-Logo.svg)',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskPosition: 'left center',
        maskPosition: 'left center',
        flexShrink: 0,
      }}
    />
  )
}
