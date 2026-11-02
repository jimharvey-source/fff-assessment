// =====================================================================
// lib/names.mjs  ·  fff-pro
// The instrument's subscale names describe a presenter in the third person
// ("Understands their subject"). The report speaks to the reader, so it
// prints these second-person names. Scoring keys stay unchanged.
// =====================================================================
export const YOU_NAMES = {
  'Builds empathy for the audience': 'Building empathy for your audience',
  'Understands themselves as a speaker': 'Understanding yourself as a speaker',
  'Understands their subject': 'Understanding your subject',
  'Defines the presentation objective': 'Defining your objective',
  'Identifies the key points': 'Identifying your key points',
  'Organises content into a clear structure': 'Organising your content into a clear structure',
  'Tests and refines the draft': 'Testing and refining your draft',
  'Creates effective support materials': 'Creating effective support materials',
  'Uses interesting and powerful language': 'Using interesting and powerful language',
  'Engages the audience actively': 'Engaging your audience actively',
  'Handles questions effectively': 'Handling questions effectively',
  'Rehearses to build confidence and fluency': 'Rehearsing to build confidence and fluency',
  'Uses voice with skill': 'Using your voice with skill',
  'Uses body language with purpose': 'Using body language with purpose',
  'Manages psychological and emotional state': 'Managing your nerves and state of mind',
};
export const you = name => YOU_NAMES[name] || name;

// Titles are instructions to the reader. Prose keeps the forms above.
export const DO_NAMES = {
  'Builds empathy for the audience': 'Build empathy for your audience',
  'Understands themselves as a speaker': 'Understand yourself as a speaker',
  'Understands their subject': 'Understand your subject',
  'Defines the presentation objective': 'Define your objective',
  'Identifies the key points': 'Identify your key points',
  'Organises content into a clear structure': 'Organise your content into a clear structure',
  'Tests and refines the draft': 'Test and refine your draft',
  'Creates effective support materials': 'Create effective support materials',
  'Uses interesting and powerful language': 'Use interesting and powerful language',
  'Engages the audience actively': 'Engage your audience actively',
  'Handles questions effectively': 'Handle questions effectively',
  'Rehearses to build confidence and fluency': 'Rehearse to build confidence and fluency',
  'Uses voice with skill': 'Use your voice with skill',
  'Uses body language with purpose': 'Use body language with purpose',
  'Manages psychological and emotional state': 'Manage your nerves and state of mind',
};
export const doName = name => DO_NAMES[name] || name;
export const youLower = name => { const n = you(name); return n[0].toLowerCase() + n.slice(1); };
