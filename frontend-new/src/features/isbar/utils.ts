/**
 * Roster/directory gender values aren't a confirmed shape (see
 * hospital_directory/client.py's own docstring — this vendor field has
 * already been wrong once in practice). Map only unambiguous values;
 * anything else is left blank rather than guessed, matching the old
 * frontend's own `_mapDirectorySexToGender` caution.
 */
export function mapExternalGender(raw: string | null | undefined): string {
  const v = (raw ?? '').trim().toLowerCase()
  if (v === 'male' || v === 'm') return 'Male'
  if (v === 'female' || v === 'f') return 'Female'
  return ''
}
