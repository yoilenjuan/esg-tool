const DIMENSIONS = [
  {
    id: 'gender',
    label: 'Gender',
    desc: 'Binary-only gender fields, gendered salutations, biased language',
  },
  {
    id: 'email_internationalization',
    label: 'Email Internationalisation (EAI)',
    desc: 'Unicode / non-ASCII email addresses rejected by forms',
  },
  {
    id: 'nationality',
    label: 'Nationality',
    desc: 'Restricted nationality options, biased nationality wording',
  },
  {
    id: 'country',
    label: 'Country',
    desc: 'Missing country options, non-inclusive country naming conventions',
  },
  {
    id: 'civil_status',
    label: 'Civil / Marital Status',
    desc: 'Limited marital status options, assumption of marriage',
  },
  {
    id: 'age',
    label: 'Age',
    desc: 'Age-discriminatory language, ageist copy patterns',
  },
  {
    id: 'race_ethnicity',
    label: 'Race & Ethnicity / Visual Diversity',
    desc: 'Lack of diverse imagery, race-coded language in copy',
  },
  {
    id: 'legal_document',
    label: 'Legal Document',
    desc: 'National ID requirements that exclude certain groups',
  },
];

const DISCLAIMERS = [
  {
    icon: '📊',
    title: 'Approximate Scoring',
    text: 'Scores are heuristic-based estimates. They do not constitute a legal compliance assessment.',
  },
  {
    icon: '🔒',
    title: 'No Identity Inference',
    text: 'Visual diversity analysis is based solely on image context. No individuals are identified.',
  },
  {
    icon: '🌐',
    title: 'Discovery Scope',
    text: 'Only publicly accessible pages are crawled. Areas behind login or CAPTCHA are excluded.',
  },
];

export function RetailScopeInfo() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-slate-800 text-white px-6 py-4">
        <h3 className="font-bold text-base">Retail Scan Scope</h3>
        <p className="text-slate-400 text-xs mt-0.5">
          8 inclusivity dimensions · automated evidence capture · PDF report
        </p>
      </div>

      {/* Dimensions grid */}
      <div className="p-5">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
          Dimensions Analysed
        </p>
        <div className="grid gap-2">
          {DIMENSIONS.map((d, i) => (
            <div
              key={d.id}
              className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition"
            >
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-xs font-black flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <div>
                <div className="text-sm font-semibold text-slate-800">{d.label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{d.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-slate-100 mx-5" />

      {/* Disclaimers */}
      <div className="p-5 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
          Important Disclaimers
        </p>
        {DISCLAIMERS.map((d) => (
          <div
            key={d.title}
            className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3.5"
          >
            <span className="text-base flex-shrink-0 mt-0.5">{d.icon}</span>
            <div>
              <div className="text-xs font-bold text-amber-900">{d.title}</div>
              <div className="text-xs text-amber-800 mt-0.5 leading-relaxed">{d.text}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
