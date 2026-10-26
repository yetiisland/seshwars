import { SPOT_FIELDS, bustChipActiveStyle, multiSpotChipActiveStyle, lightsChipActiveStyle, featureOptionsForTypes } from '../lib/spotFields'

// fieldErrors (field key -> friendly message) and fieldRefs (a ref object
// this fills in per field key) are optional — only Drop a Spot/Edit Spot's
// save-problems popup uses them, to show each invalid field's own inline
// error line and to scroll back to the first one after the popup closes.
export default function SpotFormFields({ form, setForm, fieldErrors = {}, fieldRefs }) {
  const currentType = form.type

  const isVisible = (field) => {
    if (!field.showForTypes) return true
    return field.showForTypes.includes(currentType)
  }

  const handleChipClick = (field, option) => {
    if (field.type === 'multi') {
      setForm(p => ({
        ...p,
        [field.key]: (p[field.key] || []).includes(option)
          ? (p[field.key] || []).filter(x => x !== option)
          : [...(p[field.key] || []), option],
      }))
    } else {
      setForm(p => ({
        ...p,
        [field.key]: field.clearable && p[field.key] === option ? '' : option,
      }))
    }
  }

  return (
    <>
      {SPOT_FIELDS.map(field => {
        if (!isVisible(field)) return null
        const errorMessage = fieldErrors[field.key]

        if (field.type === 'text') {
          const Tag = field.key === 'description' ? 'textarea' : 'input'
          return (
            <div key={field.key} ref={el => { if (fieldRefs) fieldRefs.current[field.key] = el }} style={{ marginBottom: 14 }}>
              <div className="section-label">{field.label}</div>
              <Tag
                className="form-input"
                placeholder={field.placeholder || ''}
                value={form[field.key] || ''}
                onChange={e => setForm(p => ({ ...p, [field.key]: e.target.value }))}
              />
              {errorMessage && <div style={{ fontSize: 11, color: '#e07070', fontWeight: 700, marginTop: 6 }}>{errorMessage}</div>}
            </div>
          )
        }

        const options = field.key === 'features' ? featureOptionsForTypes([currentType]) : field.options

        return (
          <div key={field.key} ref={el => { if (fieldRefs) fieldRefs.current[field.key] = el }} style={{ marginBottom: 14 }}>
            <div className="section-label">{field.label}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {options.map(opt => {
                const isActive = field.type === 'multi'
                  ? (form[field.key] || []).includes(opt)
                  : form[field.key] === opt
                const activeStyle = field.key === 'bust_rating' && isActive
                  ? bustChipActiveStyle(opt)
                  : field.key === 'is_multi_spot' && isActive
                    ? multiSpotChipActiveStyle(opt)
                    : field.key === 'lighting' && isActive
                      ? lightsChipActiveStyle(opt)
                      : undefined
                return (
                  <div
                    key={opt}
                    className={`chip ${isActive ? 'active' : ''}`}
                    style={activeStyle}
                    onClick={() => handleChipClick(field, opt)}
                  >
                    {opt}
                  </div>
                )
              })}
            </div>
            {errorMessage && <div style={{ fontSize: 11, color: '#e07070', fontWeight: 700, marginTop: 6 }}>{errorMessage}</div>}
          </div>
        )
      })}
    </>
  )
}
