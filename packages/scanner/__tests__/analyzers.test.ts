import { analyzeGender } from '../src/analyzers/gender';
import { analyzeAge } from '../src/analyzers/age';
import { analyzeCountry } from '../src/analyzers/country';
import { analyzeCivilStatus } from '../src/analyzers/civilStatus';
import type { PageResult } from '../src/crawler';

const makePage = (html: string, url = 'https://example.com/register'): PageResult => ({
  url,
  title: 'Test',
  html,
  hasForm: true,
  pageType: 'register',
});

describe('Gender Analyzer', () => {
  it('detects binary-only gender selector', () => {
    const page = makePage(`
      <form>
        <select name="gender">
          <option value="m">Hombre</option>
          <option value="f">Mujer</option>
        </select>
      </form>
    `);
    const result = analyzeGender([page]);
    expect(result.binaryGenderOnly).toBe(true);
    expect(result.hasNeutralOption).toBe(false);
  });

  it('detects inclusive gender selector', () => {
    const page = makePage(`
      <form>
        <select name="gender">
          <option value="m">Male</option>
          <option value="f">Female</option>
          <option value="nb">Non-binary</option>
          <option value="x">Prefer not to say</option>
        </select>
      </form>
    `);
    const result = analyzeGender([page]);
    expect(result.hasNeutralOption).toBe(true);
  });

  it('detects gendered titles', () => {
    const page = makePage('<p>Estimado Sr. / Sra.</p>');
    const result = analyzeGender([page]);
    expect(result.genderedTitlesFound.length).toBeGreaterThan(0);
  });
});

describe('Age Analyzer', () => {
  it('detects required DOB field', () => {
    const page = makePage(
      '<form><input name="fecha_nacimiento" type="date" required /></form>'
    );
    const result = analyzeAge([page]);
    expect(result.dobRequired).toBe(true);
  });

  it('detects age gate', () => {
    const page = makePage('<div>Debes tener 18 años para acceder</div>');
    const result = analyzeAge([page]);
    expect(result.ageGateDetected).toBe(true);
  });
});

describe('Country Analyzer', () => {
  it('detects limited country coverage', () => {
    const page = makePage(`
      <select name="country">
        <option value="es">Spain</option>
        <option value="fr">France</option>
      </select>
    `);
    const result = analyzeCountry([page]);
    expect(result.fieldPresent).toBe(true);
    expect(result.coverageRating).toBe('limited');
    expect(result.missingKeyCoverage).toBe(true);
  });
});

describe('Civil Status Analyzer', () => {
  it('detects heteronormative-only civil status', () => {
    const page = makePage(`
      <select name="estado_civil">
        <option value="s">Soltero</option>
        <option value="c">Casado</option>
        <option value="d">Divorciado</option>
        <option value="v">Viudo</option>
      </select>
    `);
    const result = analyzeCivilStatus([page]);
    expect(result.fieldPresent).toBe(true);
    expect(result.includesNonHeteronormative).toBe(false);
  });
});
