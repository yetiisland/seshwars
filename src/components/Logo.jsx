export default function Logo({ height = 26 }) {
  return (
    <img
      src="https://cdn.prod.website-files.com/6476a2c54e355f0af958e180/69f92fc45b852e5e158d0538_Sesh-Wars-Logo.svg"
      alt="Seshwars"
      style={{
        height,
        width: 'auto',
        filter: 'brightness(0) saturate(100%) invert(52%) sepia(35%) saturate(550%) hue-rotate(335deg) brightness(92%)',
      }}
    />
  )
}
