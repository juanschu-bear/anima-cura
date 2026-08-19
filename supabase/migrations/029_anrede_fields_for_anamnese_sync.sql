ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS anrede text,
  ADD COLUMN IF NOT EXISTS versicherter_anrede text,
  ADD COLUMN IF NOT EXISTS eb2_anrede text;

ALTER TABLE anamnese_submissions
  ADD COLUMN IF NOT EXISTS patient_anrede text,
  ADD COLUMN IF NOT EXISTS versicherter_anrede text;

UPDATE patients
SET anrede = CASE geschlecht
  WHEN 'm' THEN 'Herr'
  WHEN 'w' THEN 'Frau'
  WHEN 'd' THEN 'Divers'
  ELSE anrede
END
WHERE anrede IS NULL;

UPDATE anamnese_submissions
SET patient_anrede = COALESCE(
  NULLIF(answers ->> 'patient_anrede', ''),
  CASE lower(COALESCE(answers ->> 'patient_geschlecht', ''))
    WHEN 'männlich' THEN 'Herr'
    WHEN 'weiblich' THEN 'Frau'
    WHEN 'divers' THEN 'Divers'
    ELSE NULL
  END
)
WHERE patient_anrede IS NULL;

UPDATE anamnese_submissions
SET versicherter_anrede = NULLIF(answers ->> 'vp_anrede', '')
WHERE versicherter_anrede IS NULL;
