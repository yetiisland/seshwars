import { SPOT_FIELDS, bustChipActiveStyle } from '../lib/spotFields'

export default function SpotFormFields({ form, setForm }) {
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

        if (field.type === 'text') {
          const Tag = field.key === 'description' ? 'textarea' : 'input'
          return (
            <div key={field.key} style={{ marginBottom: 14 }}>
              <div className="section-label">{field.label}</div>
              <Tag
                className="form-input"
                placeholder={field.placeholder || ''}
                value={form[field.key] || ''}
                onChange={e => setForm(p => ({ ...p, [field.key]: e.target.value }))}
              />
            </div>
          )
        }

        return (
          <div key={field.key} style={{ marginBottom: 14 }}>
            <div className="section-label">{field.label}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {field.options.map(opt => {
                const isActive = field.type === 'multi'
                  ? (form[field.key] || []).includes(opt)
                  : form[field.key] === opt
                const activeStyle = field.key === 'bust_rating' && isActive
                  ? bustChipActiveStyle(opt)
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
          </div>
        )
      })}
    </>
  )
}
