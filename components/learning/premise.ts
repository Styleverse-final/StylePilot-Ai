// The one number on this screen that has no table behind it.
//
// PART OF THE CASE, NOT A MEASUREMENT.
//
// Everything else the learning screen renders is read from Postgres at
// request time: the fifteen modules, the 2,836 completion records, the
// segment targets on planner_adoption, the prior-year hours on dim_planner.
// This figure is different. It is the enterprise-wide structured learning
// average quoted in the case brief for the organisation as a whole -- there
// is no row anywhere in the pilot schema that yields it, because the pilot
// covers 450 planners and not the enterprise.
//
// It is here so the cohort's own measured average has something to sit
// against, and it is labelled as a premise wherever it appears on screen.
// If a table ever carries this figure, delete the constant and read the row.
export const CASE_ENTERPRISE_LEARNING_HOURS = 12;

/** Rendered next to the figure so nobody mistakes it for something measured. */
export const CASE_ENTERPRISE_LEARNING_SOURCE =
  "case premise, not measured in this schema";
