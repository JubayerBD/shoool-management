# Academic calendar and timetable

The Academic calendar menu shows a monthly school-wide calendar. Friday is the weekly holiday; Saturday is a normal school day unless another closure applies. Administrators can create, edit and remove government holidays, vacations, exams and events, including date ranges. Events may leave the school open or close it.

The bundled 2026 Bangladesh government baseline is transcribed from the Ministry of Public Administration's 9 November 2025 general/executive-order holiday gazette. November 7 is included from the October 2026 additional notification. Optional individual leave and regional-only holidays are not applied school-wide.

Sources:
- https://mopa.gov.bd/pages/public-holiday
- https://objectstorage.ap-dcc-gazipur-1.oraclecloud15.com/n/axvjbnqprylg/b/V2Ministry/o/office-mopa/2024/12/209c6283d9234a0fa8f1f30b90068b57.pdf
- https://www.bb.org.bd/mediaroom/circulars/fid/oct262026fcrpdl18.pdf

This is a bundled baseline, not a live government feed. Later amendments and institution-specific academic vacations must be added or adjusted by an administrator. Moon-dependent dates are marked. Years without a bundled list display a warning instead of implying their holiday list is complete. Events saved in the database override bundled entries and are included in normal backups.

Timetable periods are recurring weekly templates. Select several days or all six school days when creating a period. Friday cannot be selected. All selected periods are validated and committed together; a conflict prevents the batch from being saved.

The timetable displays a chosen dated week. Government holidays, school closures and Fridays show “No classes” without deleting the underlying recurring periods. The next open week resumes the routine. Attendance and examination records are not automatically changed or deleted by calendar edits.

Verification: all 57 backend tests passed, production build passed, and live browser checks covered calendar rendering, event form, school-day selection, Friday disabled, empty-day validation, dated holiday suppression and mobile rendering. Live browser checks did not change school records. Screenshots are in `artifacts/academic-calendar*.png` and `artifacts/timetable-*.png`.
