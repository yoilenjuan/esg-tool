"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const gender_1 = require("../src/analyzers/gender");
const age_1 = require("../src/analyzers/age");
const country_1 = require("../src/analyzers/country");
const civilStatus_1 = require("../src/analyzers/civilStatus");
const makePage = (html, url = 'https://example.com/register') => ({
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
        const result = (0, gender_1.analyzeGender)([page]);
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
        const result = (0, gender_1.analyzeGender)([page]);
        expect(result.hasNeutralOption).toBe(true);
    });
    it('detects gendered titles', () => {
        const page = makePage('<p>Estimado Sr. / Sra.</p>');
        const result = (0, gender_1.analyzeGender)([page]);
        expect(result.genderedTitlesFound.length).toBeGreaterThan(0);
    });
});
describe('Age Analyzer', () => {
    it('detects required DOB field', () => {
        const page = makePage('<form><input name="fecha_nacimiento" type="date" required /></form>');
        const result = (0, age_1.analyzeAge)([page]);
        expect(result.dobRequired).toBe(true);
    });
    it('detects age gate', () => {
        const page = makePage('<div>Debes tener 18 años para acceder</div>');
        const result = (0, age_1.analyzeAge)([page]);
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
        const result = (0, country_1.analyzeCountry)([page]);
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
        const result = (0, civilStatus_1.analyzeCivilStatus)([page]);
        expect(result.fieldPresent).toBe(true);
        expect(result.includesNonHeteronormative).toBe(false);
    });
});
//# sourceMappingURL=analyzers.test.js.map