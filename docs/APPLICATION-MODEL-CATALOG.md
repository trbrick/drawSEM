# drawSEM Application-Model Catalog

*The benchmark inventory of application models the schema and converter must be able
to express — used to test `SCHEMA-VISION.md` / `SCHEMA-DESIGN.md` against real models.*

A consolidated, code-free, schema-free inventory of the statistical *application* models found across this repository: drawSEM's own hand-authored edge-case specifications (all git branches) and the OpenMx example/test corpus under `Noise files/OpenMx Model Examples/`.

**Purpose.** This is the working benchmark for "what must the schema and converter be able to express." Each model is annotated with (a) the conceptual *model features* it requires and (b) the conceptual *software capabilities* it requires — described as capabilities, not API calls (e.g. "likelihood-based confidence intervals," not `mxCI`; "independent group models with estimated probability weights combined at the row level," not `mxExpectationMixture`).

**How variants are handled.** Different *specifications of the same statistical model* are merged into one **core model** with a **Variants** list. Variant axes that recur throughout: path/RAM vs matrix-algebra specification; covariance-summary vs raw-data (full-information) fitting; full ML vs weighted least squares; Cholesky vs direct (co)variance parameterization; programmatic construction style; identification scheme. These are specification differences, not different models.

**Source tags.** `[edge]` = drawSEM `edge-cases/` (richest on the `modular` branch). `[demo]` = curated top-level `OpenMx Model Examples/*.R`. `[pass]` = `models/passing`. `[night]` = `models/nightly`. `[fail]` = `models/failing` / `codeRed` / `enormous`.

**Scope.** Genuine application models, plus internal tests that exercise a *distinct modeling feature* (WLS, thresholds, definition-variable CIs, GREML, state-space, etc.). Pure software-internal tests (optimizer benchmarks, algebra-derivative checks, Hessian/SE mechanics, checkpoint plumbing) are excluded — summarized at the end.

---

## Contents

1. Baseline / saturated models
2. Regression models
3. Factor analysis & latent-variable SEM (continuous)
4. Ordinal, categorical & threshold models
5. Longitudinal & growth models
6. Dynamical-systems / time-series models
7. Multilevel, relational & cross-classified models
8. Mixture, latent-class & regime-switching models
9. Behavior-genetic models
10. Item factor analysis / IRT
11. Specialized & methodological models
12. Cross-cutting feature → model index
13. Excluded as software-internal

---

## 1. Baseline / saturated models

### 1.1 Univariate Saturated
- **Sources:** `[demo]` UnivariateSaturated(_Path/Matrix × Cov/Raw)
- **Description:** Fully-saturated single-variable model: one variance (plus one mean with raw/means data). The unrestricted reference fit other univariate models are compared against.
- **Variants:** Path vs matrix specification × covariance-only vs raw data. An aggregator walks all four side-by-side.
- **Model features:** single manifest variable; free variance; optional free mean.
- **Software capabilities:** maximum-likelihood estimation of a (co)variance/mean structure from either a summary covariance matrix + stated N, or per-observation raw records tolerating missingness; report a saturated reference fit for later comparison.

### 1.2 Bivariate Saturated / Correlation
- **Sources:** `[demo]` BivariateSaturated(_Path/Matrix × Cov/Raw, + Cholesky), BivariateCorrelation, RowObjectiveFIMLBivariateSaturated; `[pass]` SimpleCovariance, RawCov, NormalML
- **Description:** Fully-saturated two-variable model (two variances, their covariance, optional means); the correlation variant tests whether the association is significantly nonzero.
- **Variants:** Path vs matrix × cov vs raw; **Cholesky** parameterization (covariance built as a triangular factor times its transpose, guaranteeing positive-definiteness); **correlation-test** form (free vs constrained nested comparison); **explicit row-wise likelihood** form (the per-record normal likelihood written out as user algebra instead of relying on the built-in expectation).
- **Model features:** two manifest variables; free (co)variance; optional means; alternative positive-definite parameterization; nested-model comparison.
- **Software capabilities:** estimate a 2×2 covariance/mean structure from summary or raw data; support a positive-definite-by-construction parameterization; support user-authored likelihood expressions evaluated once per row and summed; compare nested models by likelihood-ratio difference.

---

## 2. Regression models

### 2.1 Simple / Multiple / Multivariate Regression
- **Sources:** `[demo]` SimpleRegression, MultipleRegression, MultivariateRegression (each Path/Matrix × Cov/Raw), MultipleRegression_MatrixRawReverse; `[pass]` IntroSEM-Univariate/Bivariate/MultiReg/MultivariateReg (Raw/Std), regression.R
- **Description:** Ordinary linear regression — one predictor (simple), several predictors → one outcome (multiple), or several predictors → several correlated outcomes (multivariate).
- **Variants:** Path vs matrix specification × covariance vs raw data; standardized-solution variants; direction-of-entry-reversed specifications (must yield identical fit). Simple/Multiple/Multivariate differ only by predictor/outcome count.
- **Model features:** directed (asymmetric) regression paths; residual variance(s); intercepts/means; predictor (co)variances; residual covariances among outcomes (multivariate).
- **Software capabilities:** ML estimation of directed effects + residual variances + intercepts from summary statistics or raw records; correlated-residual systems of equations; standardized reporting; invariance to path direction-of-entry.

### 2.2 Survey-Weighted Regression
- **Sources:** `[fail]` test-weight (NHANES)
- **Description:** Path/regression model applying per-row sampling (survey) weights to the likelihood.
- **Variants:** Single specification.
- **Model features:** manifest regression paths; observation-level weighting.
- **Software capabilities:** weight each observation's likelihood contribution by a per-row weight column.
- **Notes:** Flagged failing — exercises the row-weight feature; the script's own success check does not pass.

### 2.3 Generalized Estimating Equations (overdispersed-count regression)
- **Sources:** `[pass]` GeneralizedEstimatingEquations
- **Description:** Semi-parametric longitudinal regression for overdispersed counts using a log link, a variance-as-function-of-mean relationship, and a working correlation structure, with robust (sandwich) standard errors.
- **Variants:** Single specification (count outcome over four waves, time-invariant covariates).
- **Model features:** nonlinear **link function**; mean/variance relationship; clustered working correlation; per-row covariates and time codes; robust SEs.
- **Software capabilities:** regression with a nonlinear link relating a linear predictor to a conditional mean; variance modeled as a function of the mean; a clustered correlation structure; sandwich-estimator standard errors; per-row covariates supplied from data.
- **Notes:** Link functions are a not-yet-supported schema feature — relevant to the `@metadata$unsupported` round-tripping rule.

---

## 3. Factor analysis & latent-variable SEM (continuous)

### 3.1 Common-Factor CFA (one, two, three+ factors)
- **Sources:** `[demo]` OneFactorModel / TwoFactorModel (Path/Matrix × Cov/Raw), OneFactor(Path/Matrix)Demo, OneFactorModel_LikelihoodVector, SimpleCheckpoint; `[pass]` IntroSEM-OneFactor(Cov/Raw), IntroSEM-ThreeFactorScale1/2, OneFactorModel_PathCovReverse; `[night]` RAM-3Factor-{12..96}Indicators (raw/cov/mega), Power1/BootLRT bases; `[fail]` RAM-3Factor-{96..192}Indicators (scaling stress)
- **Description:** One or more latent common factors measured by continuous indicators; estimate loadings, residual variances, factor variances and inter-factor covariances (plus means/intercepts in raw variants).
- **Variants:** Path/RAM vs matrix specification × covariance vs raw data; factor count (1/2/3+); indicator-count scaling (12→192, a size/stress axis, not a new model); identification by fixed reference loading vs fixed factor variance; scaling-constraint variants; **per-row likelihood-vector output**; **optimizer-state checkpointing**; direction-of-entry-reversed; standardized solutions.
- **Model features:** latent variables; reflective loadings; residual variances; factor (co)variances; means model; scale identification.
- **Software capabilities:** ML measurement-model estimation from summary or raw data; latent-scale identification via fixed reference loading or variance; optionally expose likelihood as a per-observation vector; optionally persist intermediate optimizer state; likelihood-based confidence intervals on parameters; scale to large indicator counts.
- **Notes:** The canonical latent-variable family. Checkpointing and likelihood-vector output are mechanics on the same statistical model. The 192-indicator versions are performance stress tests of the path-expectation engine.

### 3.2 Latent Mediation / Multi-Latent Regression
- **Sources:** `[pass]` IntroSEM-ThreeLatentMediationTest1/2, IntroSEM-ThreeLatentMultipleRegTest1/2; `[night]` 3LatentMultiReg* (see 3.4 for the moderated forms)
- **Description:** Structural models among several latent factors — mediation chains and latent-on-latent multiple regression.
- **Variants:** Mediation vs multiple-regression structural form; alternative parameterizations.
- **Model features:** multiple latent variables; directed structural paths among latents; measurement model per latent.
- **Software capabilities:** simultaneous estimation of measurement and structural (latent-on-latent) relations under one likelihood.

### 3.3 LISREL-Parameterized SEM
- **Sources:** `[demo]` LISRELJointFactorModel, RObjectiveLISRELFactorRegression; `[pass]` LISRELFactorRegression(WithMeans, Raw, FIMLOrder), LISRELExoEndoOnly, LisrelTypeCheck, test-cor
- **Description:** Factor/structural SEM expressed in the classic LISREL exogenous/endogenous matrix family rather than RAM paths; some variants mix ordinal + continuous indicators.
- **Variants:** Full factor-regression with means × cov/raw data; exogenous-only / endogenous-only reductions; LISREL-vs-RAM equivalence cross-check; a fully **user-authored-objective** form (the entire model-implied moment structure and likelihood coded as matrix algebra and minimized as a custom objective); joint ordinal+continuous indicators with thresholds.
- **Model features:** distinct exogenous/endogenous latent blocks; structured measurement/structural matrices; means model; (optionally) thresholds for mixed data.
- **Software capabilities:** an alternative structured-matrix parameterization yielding the same fit as the path-style one; support for a fully user-defined model-implied moment structure + likelihood minimized by the optimizer (enabling families not built in).

### 3.4 Latent Regression with Moderation (definition-variable-driven structural paths)
- **Sources:** `[night]` 3LatentMultiRegWithContinuousModerator(a–e), 3LatentMultiRegWith2LevelModerator(±Missing)
- **Description:** Regression of one latent factor on two others, where the structural effect is moderated by an observed person-level variable.
- **Variants:** Continuous vs two-level (group) moderator; with/without missing data; moderation entered as a grouping vs as a per-row covariate.
- **Model features:** latent-on-latent regression; **moderation/interaction** of a path by an observed variable used as a per-row covariate; raw-data FIML with missingness.
- **Software capabilities:** allow structural coefficients to depend on per-observation covariate values (row-specific model matrices) combined across individuals in one full-information likelihood; tolerate incomplete records.

### 3.5 MIMIC (formative + reflective)
- **Sources:** `[night]` MIMIC
- **Description:** Multiple-Indicator Multiple-Cause model: one latent variable with several formative (causal) inputs and several reflective (effect) indicators.
- **Variants:** Single specification.
- **Model features:** a latent with both incoming (formative) and outgoing (reflective) paths; identification handling.
- **Software capabilities:** estimate a model mixing formative and reflective indicators and report whether parameters are identified.

### 3.6 Factor Scores
- **Sources:** `[pass]` RAM_factor_scores--paths_vs_matrices
- **Description:** Estimation of individual latent-factor scores from a fitted factor model.
- **Variants:** Path vs matrix specification (equivalent scores).
- **Model features:** latent variables; raw-data likelihood; per-individual latent estimation.
- **Software capabilities:** compute expected latent values (and their uncertainty) per observation from a fitted model.

---

## 4. Ordinal, categorical & threshold models

### 4.1 Factor / Regression Models with Ordinal or Joint (Ordinal+Continuous) Indicators — FIML
- **Sources:** `[demo]` OneFactorOrdinal(_Path/Matrix/RAM), OneFactorOrdinal01, OneFactorJoint(_Path/RAM), mxThreshold, omxConstrainMLThresholds, LISRELJointFactorModel; `[pass]` OrdinalPathTest, OrdinalTestAlgebra, OrdinalTest, JointFIMLTest, JointFIMLRegressionTest, jointFactorModelsTest, test_thresh_kept_in_order, testAllint, omxMnor; `[night]` thresholdModel1Factor{3,5,8}Variate, JointMissingTest, testPolychoricMatrix
- **Description:** Measurement/regression models for ordered-categorical indicators via underlying-liability thresholds; "joint" variants mix ordinal and continuous indicators in one likelihood.
- **Variants:** Ordinal-only vs joint ordinal+continuous; path vs matrix vs RAM specification; algebra-driven thresholds; identification by fixed thresholds vs fixed latent mean/variance ("01" form fixes two thresholds); indicator/threshold counts (3/5/8-variate, binary vs multi-category); explicit threshold-construction vs auto-ordering-constrained thresholds; with/without missingness.
- **Model features:** ordered-categorical indicators as discretized latent normal liabilities; estimated thresholds; strictly-increasing threshold ordering; mixed measurement scales; alternative liability-scale identification; raw-data likelihood (mandatory for ordinal).
- **Software capabilities:** model categorical outcomes as latent-normal discretizations by estimating cut-points; integrate the multivariate-normal likelihood over implied response regions per observation; enforce monotonic threshold ordering within a variable; combine categorical and continuous contributions in one likelihood; offer alternative scale-identification schemes.
- **Notes:** Ordinal data force raw, per-record likelihood. `mxThreshold` / `omxConstrainMLThresholds` are the same model differing only in threshold specification/constraint.

### 4.2 Polychoric / Threshold Saturated (correlation estimation)
- **Sources:** `[pass]` omxMnor; `[night]` testPolychoricMatrix; `[fail]` OrdinalLargeSample, thresholdsCross
- **Description:** Saturated threshold + correlation models — tetrachoric/polychoric correlation recovery over ordered-categorical data, and the multivariate-normal orthant-integration machinery they depend on.
- **Variants:** Direct multivariate-normal interval-probability evaluation; large-sample binary tetrachoric recovery (very sparse cells); near-equal-start thresholds (ordering stress).
- **Model features:** ordinal/threshold liabilities; polychoric/tetrachoric correlations; extreme cell-count imbalance tolerance.
- **Software capabilities:** estimate threshold cut-points and latent correlations; compute multivariate-normal rectangle/orthant probabilities; guarantee threshold ordering; remain stable under sparse cells.
- **Notes:** `thresholdsCross` documents a real defect (thresholds permitted to cross when started close). `OrdinalLargeSample` diverges and lacks a means matrix for WLS — an identification/optimization stress case (1.6M+ rows).

### 4.3 Latent-Class Analysis (categorical)
- **Sources:** `[pass]` LCAlazarsfeld, LCAlazarsfeld-rewrite
- **Description:** Classic Lazarsfeld latent-class analysis on categorical data (a discrete-latent mixture; see §8).
- **Variants:** Original and rewritten specifications.
- **Model features:** latent categorical class membership; class-conditional response probabilities; marginal ML.
- **Software capabilities:** estimate class proportions and class-conditional category probabilities by marginalizing over discrete latent classes. (See §8 for the mixture-weighting capability shared with finite mixtures.)

---

## 5. Longitudinal & growth models

### 5.1 Latent Growth Curve (LGCM) — *core model with several variants*
- **Sources:** `[edge]` simple/growth-curve, cross-classified/growth-curve, lgcm-nonstationary, bivariate-growth; `[demo]` LatentGrowthCurveModel (Path/Matrix Raw, ModelRec, ObjectAdd); `[pass]` LGC_PathCov, LGC_MatrixCov; `[night]` wu-neale-2012-lgc, wu-neale-2012-symmetry; `[fail]` wu-neale-2012-lgc (enormous CI sim)
- **Description:** Repeated-measures change model giving each person a latent intercept (initial level) and latent slope (rate of change); the intercept loads at unity on every occasion, the slope loads at each occasion's time value. Estimates between-person intercept/slope means, variances, and covariance, plus residual variances.
- **Variants:**
  - **Univariate / wide & tall data:** one intercept + slope per person; supports one-row-per-person and one-row-per-occasion layouts; tolerates unbalanced/irregular spacing.
  - **Path vs matrix specification × covariance vs raw data.**
  - **Construction-style** variants (recursive build vs build-and-assemble) — identical statistics.
  - **Bivariate growth** (§overlaps 5.2): two constructs sharing one time dimension, full cross-construct growth-factor covariances.
  - **Non-stationary initial condition:** the initial latent level/slope live outside the measured series as a singleton anchor that fans into every measurement instance; residual variance constrained equal across time; no autoregression.
  - **Cross-classified:** students growing over time taught by teachers in a many-to-many crossing; adds a separate teacher-effectiveness factor and student×teacher×time outcomes with cross-grouping paths (see §7).
  - **Boundary/symmetry edge:** behavior at zero slope-variance bound and loading/variance sign indeterminacy.
- **Model features:** latent intercept/slope factors; **fixed unit loadings** and **time-valued loadings** (data-derived, possibly non-integer/irregular); means model for growth factors; factor variances + intercept–slope covariance; residual variances; cross-construct covariances (bivariate); singleton off-series anchor module (non-stationary); variance-boundary feasibility.
- **Software capabilities:** build a per-person replicated factor structure; bind loading values to data-derived time values (distinguishing observation *order* from actual time *value*); handle unbalanced/irregular longitudinal data (naturally via raw-data likelihood tolerant of missingness); fan a singleton structural module into every instance of a replicated series (one-to-many); estimate near variance bounds; likelihood-based CIs with boundary correction.
- **Notes:** The two `[edge]` growth-curve `.md` files predate the module/cascade architecture and are retained as reference (identical on `main` and `modular`). The Wu-Neale enormous variant runs tens of thousands of fits with boundary-corrected CI searches.

### 5.2 Bivariate / Parallel-Process Growth
- **Sources:** `[edge]` bivariate-growth
- **Description:** Joint growth of two constructs measured over a shared timeline; estimates the full covariance among all four growth factors including cross-construct links.
- **Variants:** Single base; optional homoscedastic vs heteroscedastic measurement error across time; optional growth-factor means.
- **Model features:** two intercepts + two slopes (one set per person, not replicated over time); time-driven replication applied only to indicators; within- and cross-construct growth-factor covariances.
- **Software capabilities:** two parallel measurement structures sharing one time dimension yet semantically distinct; covariance paths bridging the two construct groupings at the growth-factor level; substitution of actual time-coordinate values into slope loadings at expansion time.
- **Notes:** Cited as the original motivation for module-based structure (a single per-node level-of-measurement attribute could not represent two parallel cascades sharing a time dimension).

### 5.3 Autoregressive / Simplex
- **Sources:** `[demo]` (none distinct); `[pass]` Autoregressive_{Path/Matrix × Cov/Raw}, Autoregressive_Transpose_*, Autoregressive_Tree_{Matrix/Path}
- **Description:** First-order autoregressive (simplex) structure over repeated measures; "tree" variants propagate the autoregression through a simulated pedigree via a per-row definition variable.
- **Variants:** Cov vs raw; path vs matrix; transposed-matrix arrangement; **tree** form (autoregression along a family tree driven by a definition variable).
- **Model features:** directed lagged paths; means model; raw-data likelihood; definition variables (tree).
- **Software capabilities:** sequential/lagged directed relations among repeated measures; per-observation covariate values entering as definition variables.

### 5.4 STARTS (Stable Trait, AutoRegressive Trait, State)
- **Sources:** `[night]` startsTestNoMissing, startsTestMissing
- **Description:** Decomposes repeated multi-indicator measurements into a stable trait, an autoregressive trait, and an occasion-specific state.
- **Variants:** Complete vs missing data.
- **Model features:** latent occasion factors with multiple indicators; variance decomposition into stable/autoregressive/state parts; autoregressive latent dynamics; FIML with missingness.
- **Software capabilities:** longitudinal latent variance-decomposition with autoregressive dynamics under full-information likelihood.

---

## 6. Dynamical-systems / time-series models

### 6.1 State-Space (discrete & continuous time) — *core model with variants*
- **Sources:** `[edge]` state-space (CT-AR / Ornstein-Uhlenbeck); `[pass]` StateSpaceOsc, SubStateSpaceOsc, StateSpaceInputs, StateSpaceMissingData, StateSpaceAlg; `[night]` StateSpaceContinuous, StateSpaceLatentGrowth, MultilevelStateSpaceEx5, ContinuousTime, test-LatentAR-190605
- **Description:** Linear Gaussian latent-state models fit by recursive (Kalman) filtering; the continuous-time form expresses dynamics as a differential equation (CT-AR / Ornstein-Uhlenbeck) where the discrete autoregressive coefficient between observations is *derived* from a continuous-time drift parameter and the elapsed interval, not freely estimated.
- **Variants:** Oscillator dynamics (+ embedded submodel); exogenous inputs; missing observations; algebra-built matrices; **continuous-time** (drift matrix, per-row/irregular intervals); latent growth recast as state-space; two-level multilevel state-space; latent-AR layered on a growth curve; bivariate CT-VAR generalization (noted, not always implemented).
- **Model features:** latent dynamic states; transition/dynamics, measurement, process- and observation-noise structure; single-indicator fixed-loading measurement (CT-AR base); free drift & diffusion; transition coefficients and process-noise *computed* from drift/diffusion/interval; distinct initial-state variance boundary condition; exogenous inputs; missingness; multilevel decomposition.
- **Software capabilities:** recursively filter latent states through time accumulating a prediction-error likelihood (Kalman filter/smoother); compute transition coefficients via matrix-exponential-style transform of a drift parameter scaled by the observation interval (scalar in the univariate case, true matrix exponential in the multivariate case); compute interval-dependent process-noise; bind per-transition time intervals from data (explicit column or derived from timestamps); support free parameters not attached to a single path but feeding computed path/variance values; handle exogenous drivers and missing observations; latent-state scoring; within/between multilevel state partitioning.
- **Notes:** `[edge]` flags this as possibly needing schema/operator infrastructure beyond the current proposal (off-path free parameters, matrix-valued computed values, runtime binding of data intervals to computed expressions).

### 6.2 Latent Differential Equation (LDE)
- **Sources:** `[demo]` LDE
- **Description:** Second-order latent differential equation fit to a single time series via time-delay embedding; recovers latent level/first-/second-derivative factors and the dynamic coefficients relating them (e.g., a damped oscillator).
- **Variants:** Covariance-data fit; raw-data fit augmented with means.
- **Model features:** fixed polynomial loading matrix mapping latent derivatives to embedded observations; structural matrix of dynamic coefficients among latent derivatives; latent/residual covariances; optional means; LISREL-style expectation.
- **Software capabilities:** estimate a dynamical-systems model linking latent derivatives to time-delay-embedded data through fixed loadings, recovering the differential-equation coefficients by ML from summary or raw data.
- **Notes:** Relies on data preprocessing (embedding) external to the model.

---

## 7. Multilevel, relational & cross-classified models

### 7.1 Multilevel CFA (two-level / doubly-latent)
- **Sources:** `[edge]` multilevel-cfa; `[pass]` multilevelLatentRegression, UnivariateRandomInterceptWide; `[night]` mplus-ex9.6/9.11/9.12, xxm-mlcfa, xxm-hcfa
- **Description:** Decomposes indicator covariance into within-cluster (e.g. student) and between-cluster (e.g. school) factor structures; each observed score = cluster mean + within-cluster deviation.
- **Variants:** Cross-level loadings equated (configural/metric invariance) vs freely estimated per level; two-/three-level; with covariates; multiple-group crossed with levels.
- **Model features:** within-level and between-level latent factors over shared indicators; hierarchical nesting with cluster-locally-unique IDs; per-level factor and residual variances; optional cross-level equality constraints; unbalanced clusters; raw-data likelihood.
- **Software capabilities:** hierarchical nesting where lower-level IDs are interpreted within their parent cluster (both coordinates in resolved names); partition observed variance into between/within factor structures over the same indicators; cluster-level grouping as independence unit; accommodate shared raw data feeding both levels or a separate cluster-aggregate dataset; variable cluster sizes.
- **Notes:** `[edge]` raises the open question of how the between-level obtains cluster means (precomputed columns, separate aggregate dataset, or implicit via raw-data likelihood). Intraclass correlation is a derived post-estimation quantity.

### 7.2 Multilevel Regression / Random Slopes & Intercepts
- **Sources:** `[pass]` MultilevelUniRandomSlopeInt, UnivariateRandomInterceptWide, lmer-1/2, heck-thomas-2015ch4; `[night]` mplus-ex9.1/9.23, multilevelLatentRegression2
- **Description:** Random-intercept and random slope-and-intercept regression across nested levels, validated against mixed-model packages.
- **Variants:** Random-intercept-only (wide) vs random slope+intercept (long); latent regression across levels; lmer-equivalent random slope of a within covariate via between-level mapping; multilevel mediation.
- **Model features:** random effects as latent variables; primary/join keys; definition variables; raw-data likelihood; between-level parameter mapping.
- **Software capabilities:** models linked across levels by keyed joins with upper-level latent random effects propagating to lower-level observations; per-row covariates as definition variables; likelihood marginalizing over level-specific latents.

### 7.3 Cross-Classified & Relational SEM
- **Sources:** `[edge]` cross-classified/growth-curve; `[pass]` xxm-1..4, cycle, Rampart0/1, DogChain; `[night]` mplus-ex9.x cross-classified, xxm-cfars/lgc/faces
- **Description:** Lower-level units linked to higher-level units by keys, including non-nested (cross-classified) groupings and cyclic/relational structures; e.g. students crossed with teachers, or growth crossed with a teacher-effectiveness factor.
- **Variants:** Cross-classified bivariate random intercepts; relational acyclic (Rampart rotation) vs cyclic graphs; multi-level joins; relational chains.
- **Model features:** two or more crossed (non-nested) random-effect groupings; per-grouping replication of reusable sub-models; cross-grouping paths into shared outcomes; relational data joins.
- **Software capabilities:** reusable component models instantiated a data-determined number of times per grouping factor; resolve which component instances connect to which outcome instances (crossing inferred from observed combinations vs assumed fully crossed); render/manage models expanding to dozens of nodes / 100+ paths via collapse/grouping abstractions.

### 7.4 Rampart Hierarchical Factor Model
- **Sources:** `[pass]` Rampart0/1; `[night]` RampartDimnames; `[fail]` rampart (enormous)
- **Description:** Deeply nested (schools → teachers → students) single-factor-per-level model with shared latent skill flowing down the hierarchy, exercising the "rampart" simplification for efficient multilevel estimation.
- **Variants:** Single specification; generated nested hierarchy with missingness.
- **Model features:** nested random-effects/multilevel factor structure; relatedness across levels; shared loading/residual parameters; missing data.
- **Software capabilities:** multilevel estimation that algebraically collapses repeated nested units for efficiency (structural-symmetry exploitation); shared parameters relabeled per level; full-information missing-data handling.
- **Notes:** Enormous by structural complexity.

### 7.5 Multilevel VAR(1) with Measurement Error
- **Sources:** `[edge]` mlvar-measurement
- **Description:** Multilevel first-order vector autoregression on two latent states (single-indicator unit-loading measurement), fit across persons under stationarity (population homogeneity); latent states carry autoregressive + cross-lagged dynamics across adjacent within-person timepoints.
- **Variants:** Base (all free parameters equal across time); noted heteroscedastic-measurement-error extension.
- **Model features:** latent states with single-indicator fixed-loading measurement; autoregressive + cross-lagged structural paths; process-noise covariance; measurement-error variances; one independent series per person (unbalanced); cross-time equality constraints (stationarity); raw-data likelihood.
- **Software capabilities:** replicate a time-indexed measurement-plus-process unit a data-determined number of times per person (time count read from data); connect successive replicates with autoregressive/cross-lagged paths; enforce cross-time equality through shared parameter naming (label-based equality) rather than explicit constraint equations (which would unidentify/slow the model); accept per-person series of differing length including single-timepoint persons.
- **Notes:** `[edge]` calls this the simplest case forcing simultaneously a generative time dimension, inter-instance paths, nested measurement-inside-process units, and stationarity constraints.

### 7.6 Measurement Burst Design (nested longitudinal)
- **Sources:** `[edge]` burst-design
- **Description:** Intensive-longitudinal design nesting many closely-spaced timepoints within widely-spaced bursts, nested within persons; latent states carry within-burst autoregression with optional between-burst carryover.
- **Variants:** Bursts independent (no between-burst paths) vs bursts connected (carryover path from last-of-burst to first-of-next); noted burst-level growth-factor extension.
- **Model features:** two nested sequential dimensions (timepoints within bursts within persons); latent states with measurement error; within-burst autoregression; optional between-burst boundary paths; process/measurement variances; person as independence unit; raw-data likelihood.
- **Software capabilities:** nested replication (inner sequence replicated inside each outer element) accumulating both coordinates without naming collision; address boundary instances of the inner sequence by position (first/last); make between-level connecting paths optional; read both nesting levels from data (or derive from timestamps).

---

## 8. Mixture, latent-class & regime-switching models

### 8.1 Finite Mixture / Latent-Class (EM)
- **Sources:** `[demo]` simple_mixture_model_EM; `[pass]` MixtureByEM, LCAlazarsfeld(+rewrite), mixture_rename_regression_test; `[night]` SimpleMix, mixture_Pboot
- **Description:** Combine several class-specific submodels with estimated mixing weights; includes a Gaussian two-component mixture estimated via explicit posterior-weighted EM, and categorical latent-class analysis.
- **Variants:** Continuous two-component normal mixture with explicit posterior algebra (hand-coded EM) vs built-in mixture machinery; softmax vs raw-sum weighting; categorical LCA; one-class-null vs two-class alternative for a bootstrap likelihood-ratio test.
- **Model features:** multiple component/class submodels; estimated class-membership probabilities; per-class parameters; per-observation likelihood combined across classes; bootstrap LRT of class number.
- **Software capabilities:** evaluate independent component models and combine their per-observation likelihoods using estimated probability weights (softmax or raw-sum normalized) into one overall likelihood; support a custom alternating EM plan where one step updates posterior class probabilities from current parameters and the other maximizes the probability-weighted likelihood; expose per-observation likelihoods to user algebra; recompute derived quantities (posteriors) only on demand; bootstrap comparison of nested mixture specifications.

### 8.2 Growth Mixture
- **Sources:** `[demo]` GrowthMixtureModel (Path/Matrix Raw); `[night]` GrowthMixtureModelRandomStarts
- **Description:** Latent growth curve fit as a finite mixture of latent trajectory classes, each with its own growth parameters, plus estimated class proportions.
- **Variants:** Path vs matrix; with random starting values (multistart against local optima).
- **Model features:** class-specific growth submodels; latent intercept/slope per class; estimated mixing proportions; raw-data likelihood.
- **Software capabilities:** combine class-specific per-observation growth likelihoods with estimated class-probability weights (builds on §8.1 mixture weighting + §5.1 growth); robust multistart optimization.

### 8.3 Regime-Switching Dynamics
- **Sources:** `[night]` RegimeSwitching_MatrixRawNoCholDifferentTransitions(+AllFixed)
- **Description:** Mixture of dynamic (growth/state) models with class-specific transition structures.
- **Variants:** Different transition structures per regime vs all-fixed transitions.
- **Model features:** multiple dynamic submodels; estimated regime weights; per-regime transition parameters.
- **Software capabilities:** combine dynamic-model likelihoods via estimated regime probabilities, with regime-specific transition structure.

### 8.4 Hidden Markov Models
- **Sources:** `[pass]` HMM-basic, HMM-defvar, HMM-multigroup
- **Description:** Latent discrete states with an initial-state distribution, a transition matrix, and state-conditional emission models.
- **Variants:** Basic single trajectory; definition-variable-driven; multi-group.
- **Model features:** latent discrete states with transition probabilities; emission likelihoods; definition variables; multiple groups.
- **Software capabilities:** sequential latent-state likelihood combining initial-state and transition probabilities with state-conditional emission densities; per-row covariates; group structure.

---

## 9. Behavior-genetic models

### 9.1 Classical Twin ACE Model — *core model with several variants*
- **Sources:** `[edge]` twin-ace; `[demo]` UnivariateTwinAnalysis (tutorial, Path/Matrix Raw), BivariateHeterogeneity; `[pass]` univACEP, univACE_drop_helper, ACEDuplicateMatrices, TwinAnalysis_Multivariate_Matrix_Raw, TwinAnalysisLikelihoodVector, UnivHetModTwinAnalysis…Ord…, bivCorM, univSatM, Acemix, Acemix2; `[night]` univACErSEM, ETC88, MultigroupRobustSE_test; `[fail]` umxACE_codeRed, UnivariateTwinAnalysis20090925
- **Description:** Decompose phenotypic variance into Additive-genetic (A), Common/shared-environment (C), and unique-Environment (E) components. The twin pair is the unit; identification exploits the known genetic correlation (MZ 1.0, DZ 0.5).
- **Variants (this is the canonical "core + variants" case the catalog is built around):**
  - **Two-group form:** separate MZ and DZ group models sharing equated A/C/E parameters, combined into one fit (the classic specification).
  - **Definition-variable form:** a single combined dataset where the genetic cross-twin correlation is *looked up per row from a zygosity column* (MZ vs DZ) instead of split into groups — the explicit MZ/DZ-groups vs def-var-zygosity contrast.
  - **Parameterization:** variance-component form (A/C/E variances, optional sum-to-one constraint) vs path-coefficient form (A/C/E loadings free, component variances fixed to one).
  - **Multivariate / Cholesky** ACE (variance decomposition across several phenotypes).
  - **Ordinal** ACE / heterogeneity with thresholds and qualitative sex differences.
  - **Uncertain-zygosity mixture** (`Acemix`): each pair's zygosity known only probabilistically, combined as a mixture of MZ/DZ likelihoods (+ regularization variant).
  - **Tutorial / model-comparison** workflow: saturated → assumption tests → ACE → reduced submodels; likelihood-vector and submodel-dropping helpers.
- **Model features:** latent A/C/E components per twin with cross-twin equality of variance parameters; relational cross-twin covariance paths defined by shared family membership; a data-looked-up genetic correlation differing by zygosity; fixed unit shared-environment correlation; deliberate absence of a unique-environment cross-twin path; optional sum-to-one constraint or fixed-variance reparameterization; a non-temporal grouping (family) as independence unit; ordinal thresholds (categorical variant); mixture weighting (uncertain zygosity); nested submodel comparison.
- **Software capabilities:** pair instances of a grouping with themselves (within-family twin pairs) rather than nesting, generating relational covariance paths only between same-family members; let a path's value be looked up from a data column (zygosity) so MZ/DZ families get different genetic correlations; support either an explicit nonlinear sum-to-one constraint or a fixed-variance/free-loading reparameterization; fit several group-specific models jointly with cross-group equality and summed likelihoods; combine group likelihoods via probability weights (uncertain zygosity); likelihood-ratio comparison of nested submodels; handle a model with no time dimension at all.
- **Notes:** The only `[edge]` case with no temporal/sequential dimension — tests non-temporal groupings. Pedigree-style side-by-side rendering of exactly two twins per family; extended pedigrees out of scope for the edge case (but see §9.2). `umxACE_codeRed` is a documented optimizer-fragility case (historically Mx-status-RED across optimizers, later passing on a specific build). `UnivariateTwinAnalysis20090925` is a deprecated-API script that no longer runs.

### 9.2 Nuclear Twin Family / Extended Kinship
- **Sources:** `[night]` ETC88; `[fail]` NTF_design, ComputeOrderError
- **Description:** Extended twin-family designs decomposing variance into additive-genetic, dominance, sibling, and familial-environment components plus an assortative-mating copath, across many relative classes, using algebraic expected covariances.
- **Variants:** Two-group (MZ/DZ) per-group algebra; refactored three-group form sharing a common matrix group via a quadratic operator; extended twin-kinship correlations across many relative classes (ETC88).
- **Model features:** matrix-algebra-defined expected covariances; nonlinear constraints; multigroup fit; identification handling (familial vs sibling variance not simultaneously estimable — one path fixed).
- **Software capabilities:** user-defined matrix-algebra expressions feeding the expected covariance; nonlinear equality/inequality constraints; a shared parameter group referenced by multiple group models; control over computation-step ordering.
- **Notes:** `NTF_design` is flagged failing without a recorded reason (possible non-PD expected matrix). `ComputeOrderError` documents a compute-ordering bug (a matrix object missing; checks the un-run model).

### 9.3 GREML / Genomic-Relatedness Variance Components
- **Sources:** `[pass]` GREML--minimal/151123missingDataRegression/polyphenotype/testStarter…, GREML_intercept_check, GREML_multimodel_inference, GREML_partial_gradients(+EI), AugmentedGREMLfitfunction, Tiny_GREML…; `[night]` GREML_monophenotype_1GRM(+GradDesc), GREML_endo_rgsn_test, grm_in_fiml
- **Description:** Estimate additive-genetic and residual variance (and heritability) from a genomic-relatedness matrix over one large sample, with fixed-effect covariates and a structured residual covariance.
- **Variants:** Single-GRM monophenotype vs multi-phenotype residual structure; gradient-descent variant; endogeneity/genetic-causation extension; equivalent GRM model via ordinary FIML (cross-check); analytic partial-derivative provision; augmented/penalized fit; missing data.
- **Model features:** a single N×N relatedness matrix as the covariance over one big "row"; variance-component estimation; fixed-effect covariates; derived quantities (heritability); analytic derivatives.
- **Software capabilities:** treat the entire sample as one multivariate observation whose covariance is a weighted sum of a supplied relatedness matrix and identity; maximize the (restricted) likelihood efficiently for large matrices; accept user-supplied analytic gradients of the covariance; handle missing observations; report functions of variance components.
- **Notes:** A specialized large-matrix relatedness expectation distinct from row-wise FIML.

### 9.4 Allele-Frequency / Locus Likelihoods
- **Sources:** `[demo]` OneLocusLikelihood, TwoLocusLikelihood; `[pass]` oneLocusLikelihood, twoLocusLikelihood, multinomSE
- **Description:** Estimate allele frequencies from ABO blood-group phenotype counts by maximizing a multinomial likelihood whose category probabilities are nonlinear functions of the frequencies. No covariance model at all.
- **Variants:** One-locus (three frequencies, explicit sum-to-one constraint); two-locus (complementary frequencies derived by algebra, category probabilities from products).
- **Model features:** free frequency parameters; algebraically-derived expected category proportions; a user-defined multinomial log-likelihood; equality (sum-to-one) constraint; observed counts as fixed quantities.
- **Software capabilities:** minimize a user-authored likelihood built from arbitrary algebra over fixed observed counts, subject to nonlinear/equality parameter constraints, where expected proportions are derived expressions rather than a covariance structure.
- **Notes:** Good stress test for non-SEM objectives + constraints.

---

## 10. Item factor analysis / IRT

### 10.1 Item Factor Analysis / Item Response Theory (marginal ML)
- **Sources:** `[demo]` (none); `[pass]` ifa-grm1, ifa-drm-mg(2), ifa-lmp, ifa-missingdata, ifa-allna, fm-example2-2; `[night]` ifa-2d-mg, ifa-bifactor, ifa-cai2009, ifa-drm-wide, ifa-latent-2d, ifa-ms, ifa-meat-2d, ifa-meat-2tier, fm-example2-1/4/8; `[fail]` ifa-2pl/3pl/4pl/grm/bifactor-se, ifa-cyh2011-sim1/2, ot2kSim (enormous)
- **Description:** Fit item-response/item-factor models to categorical item data by marginalizing over continuous latent traits; estimate item parameters and optionally latent distribution and factor scores.
- **Variants:**
  - **Item models:** dichotomous logistic (2PL / 3PL with guessing / 4PL with upper asymptote), graded-response (ordered polytomous), nominal-response, logistic monotonic-polynomial.
  - **Latent dimensionality:** unidimensional, 2-dimensional, bifactor (general + group factors), two-tier (high-dimensional, dimension count scaling with item count).
  - **Multiple groups** with cross-group item constraints, item-bias / latent-mean differences.
  - **Latent-distribution estimation** and **factor scoring**; robust/sandwich information; wide/many-item scaling; missing and fully-missing rows.
  - **Simulation studies:** parameter-recovery + SE validation (enormous); Cai-Yang-Hansen two-tier replications; generate-vs-fit misspecification + ROC/AUC item-misfit detection.
- **Model features:** latent continuous traits; item-specific nonlinear response functions; ordered-categorical / nominal item data; marginal ML over the latent distribution; multiple groups; missing data; nominal-category transformation matrices (nominal/two-tier).
- **Software capabilities:** marginalize the joint item likelihood over latent traits by numerical integration on a quadrature grid; optimize item parameters via an expectation-maximization scheme; recover latent scores and a latent distribution; multiple groups sharing item parameters while differing in latent moments; dimension-reduction integration exploiting two-tier structure so estimation stays tractable as latent dimensionality grows; standard-error/information-matrix computation; bulk fitting across large simulation grids.
- **Notes:** The largest feature-distinct family. The `[fail]`/enormous variants are heavy by simulation scale (hundreds of replications × thousands of persons) and by latent dimensionality (integration dimensions scaling with item count).

---

## 11. Specialized & methodological models

### 11.1 Definition-Variable Models (per-observation parameters / known-class effects)
- **Sources:** `[demo]` DefinitionMeans (Path/Matrix Raw); `[pass]` DefinitionMeans(Path), MxEvalDefinitionVar, defvaralgebra, nonlinearDefinitionTest, ConfidenceIntervalsDefVar, RAM-FIML-defvars, NA-defvar, BogusDefinitionVariables, FourAAAA; `[night]` mxSE-defvar, 180209--defvars, DefinitionIloo, DefaultOptTolerance; `[fail]` categoricalDefinitionTest, MultilevelLongFormatFailing
- **Description:** Models where per-row data columns enter as parameters (group-specific means, moderated/nonlinear effects, individual time codes, subject indices), within a single combined raw dataset rather than via explicit groups.
- **Variants:** Definition variable selecting group means (matrix/path); nonlinear function of a definition variable; definition variable in algebra; confidence intervals with definition variables active; missing/invalid definition-value handling; per-subject random coefficients indexed by subject ID (long format); ordinal outcomes with covariate-moderated loadings.
- **Model features:** definition variables read per observation; individual-specific expected moments; common variance structure; nonlinear parameter expressions; likelihood-based CIs with definition variables; defined behavior for missing/out-of-range values.
- **Software capabilities:** allow expected-moment parameters to depend on per-observation covariate values drawn directly from the data, so each record gets its own model-implied moments within one likelihood; substitute definition values inside nonlinear algebra; compute CIs with definition variables active; defined handling of missing/out-of-range definition values.
- **Notes:** Canonical demonstration of moderation/known-class effects without explicit multiple groups. `MultilevelLongFormatFailing` (subject-ID-indexed random coefficients) is flagged failing.

### 11.2 Weighted Least Squares (WLS / DWLS / ULS) fitting
- **Sources:** `[pass]` ContinuousOnlyWLSTest, SaturatedWLSTest, WeightedWLS, MultipleGroupWLS, WLSCompare, WLS+CI, acov_regression_test, exoPredWLS(2), jointFactorWls; `[night]` thresholdModel1Factor5VariateWLS, JointWLS, MultigroupWLS, LegacyWLS+CI, LegacyContinuousOnlyWLSTest
- **Description:** A *fitting-method* family (cross-cutting): estimate structural models by fitting model-implied summary statistics (means, (co)variances, thresholds, polychoric/polyserial correlations) to sample counterparts weighted by their asymptotic covariance, instead of full ML.
- **Variants:** Continuous-only vs ordinal/threshold vs joint ordinal-continuous; full-weight (WLS) vs diagonal (DWLS) vs identity (ULS) weighting; saturated baseline via WLS; WLS with exogenous definition-variable predictors; WLS + confidence intervals; regression recovered through marginal WLS; single- vs multiple-group; cross-validated against ML.
- **Model features:** weighted least squares to summary statistics; asymptotic covariance of statistics; thresholds for ordinal data; exogenous predictors as definition variables; multiple groups; CIs.
- **Software capabilities:** compute first/second-order sample statistics and their (full/diagonal/identity) asymptotic weight matrix, then minimize a weighted discrepancy between observed and model-implied statistics; correct summary-stat computation including thresholds and exogenous covariates; CIs and multi-group support under least-squares fit.

### 11.3 Custom Row-Likelihood / User-Defined Distribution
- **Sources:** `[demo]` RowObjectiveSimpleExamples; `[pass]` bivLognormDemo, TestRowObjective, TestRowObjectiveExistenceVector, rowAlgTest140708, SimpleRObjective, rfitfunc; `[codeRed]` fail_on_re-run_entity_already_exists
- **Description:** Models whose likelihood is defined row-by-row through user algebra (e.g. a shifted bivariate lognormal) or through a user-supplied function in the host language.
- **Variants:** Per-row custom-algebra likelihood (with missing-data column selection); existence-vector handling; user-supplied host-language fit function.
- **Model features:** per-row custom likelihood; per-row missing-data handling (existence-vector column selection); arbitrary user algebra/objective.
- **Software capabilities:** evaluate an arbitrary user-specified per-row likelihood expression (or external function), summed across observations, robust to missing data; select available variables per row.
- **Notes:** `fail_on_re-run_entity_already_exists` is code-red — re-running the same fitted custom-row model errors ("entity already exists").

### 11.4 Constraint-Driven Estimation
- **Sources:** `[pass]` multinomSE, MultivariateConstraint, MultipleGroupRAMconstraint, SimpleConstraint, oneLocusLikelihood, twoLocusLikelihood
- **Description:** Models whose estimation is governed by equality/inequality constraints among parameters (multinomial proportions summing to one, allele frequencies), often with custom-algebra objectives.
- **Variants:** Multinomial proportions under sum-to-one (with analytic gradient); multivariate equality constraints; constrained multi-group RAM; allele-frequency likelihoods with summation constraints.
- **Model features:** nonlinear equality/inequality constraints; custom-algebra fit; multiple groups; parameter constraints.
- **Software capabilities:** optimization subject to user-specified nonlinear equality/inequality constraints among parameters; user-defined objective expressions; correct uncertainty estimation under active constraints.

### 11.5 Pearson Selection / Range-Restriction Correction
- **Sources:** `[pass]` PearsonSelection
- **Description:** Apply Pearson-Aitken selection formulas to adjust covariances and means under selection on a subset of variables.
- **Variants:** Explicit selection matrices vs auto-detected selection mode.
- **Model features:** algebra transforming covariance/mean under selection.
- **Software capabilities:** analytic adjustment of a covariance matrix and mean vector given assumed selection on certain variables.

### 11.6 Regularized / Penalized Estimation
- **Sources:** `[pass]` regularize
- **Description:** Estimation with lasso, ridge, and elastic-net penalties on grouped parameters across two-group covariance models.
- **Variants:** Lasso, ridge, elastic-net penalty groups within one model.
- **Model features:** penalized fit functions; parameter grouping; multiple groups.
- **Software capabilities:** add shrinkage penalties (L1/L2/mixed) on designated parameter groups to the objective, with hyperparameters.

### 11.7 Multiple Imputation Round-Trip
- **Sources:** `[fail]` mice
- **Description:** Fit a small one-factor model, then combine results across multiply-imputed datasets.
- **Variants:** Single specification.
- **Model features:** single-factor measurement model; missing-data imputation; pooling across imputations.
- **Software capabilities:** combine model fits across multiply-imputed datasets into pooled estimates.
- **Notes:** Flagged failing — no pooling method exists for the model class, so the combine step errors.

### 11.8 PPML Structure-Exploiting Factor Models
- **Sources:** `[fail]` PPML_test2L3M/2L4M(_MultiLayer), PPML_100days
- **Description:** Confirmatory factor models with fixed (known) loadings used to exercise a likelihood-evaluation shortcut that exploits exploitable structure; includes a higher-order-factor multilayer form and a 100-day longitudinal growth-style model (constant/linear/exponential-decay latents).
- **Variants:** 2-latent/3- or 4-manifest; saturated vs unsaturated latent covariance; ±one fixed latent mean; multilayer (third "root" latent); 100-manifest growth-shaping form.
- **Model features:** latent factor model with fixed loadings; free latent means/variances/covariance; shared (equality-constrained) residual variance; covariance+means data; higher-order latent (multilayer).
- **Software capabilities:** estimate a structural model from a covariance matrix + mean vector; equality constraints across residuals; means/intercept structure; an optimization shortcut that detects exploitable structure and validates it against ordinary likelihood across permutations.
- **Notes:** All flagged failing; `PPML_100days` errors because a required internal test function no longer exists.

### 11.9 Confidence-Interval Optimizer Stress Cases
- **Sources:** `[fail]` SimpleConfidenceIntervals (twin), CSOLNPmtcars, challengingCI (+ saved ctsem model)
- **Description:** Models whose purpose is to probe optimizer behavior when computing likelihood-based confidence intervals (especially under specific optimizers), including a twin model, a simple independence-variance model, and a continuous-time SEM drift parameter.
- **Variants:** Twin CI (multigroup); simple variance on mtcars (optimizer step-size comparison); challenging CI on a saved continuous-time SEM drift parameter (optimizer comparison).
- **Model features:** likelihood-based intervals on bounded parameters; multigroup (twin); continuous-time dynamic SEM (challengingCI).
- **Software capabilities:** likelihood-based confidence intervals via constrained optimization; user-chosen optimization engines; interval search requiring parameter boundaries to avoid looping.
- **Notes:** Documented optimizer-fragility cases; `challengingCI` depends on a saved binary model file and no longer runs as written.

### 11.10 Classic Mx (.mx) Reference Scripts
- **Sources:** `[fail]` mx-scripts/{SimpleRegression, MultipleRegression, MultivariateRegression, Autoregressive, TwoFactorModel} (Raw/Cov)
- **Description:** Legacy classic-Mx-syntax (not OpenMx R) versions of the standard teaching examples — regression family, a 5-occasion autoregressive chain, and a 6-indicator two-factor CFA — all in RAM matrix form.
- **Variants:** Regression (simple/multiple/multivariate), autoregressive, two-factor; each in raw and covariance input forms.
- **Model features:** RAM directed/undirected paths; means; factor loadings; lag-1 autoregression.
- **Software capabilities:** RAM matrix specification (asymmetric/symmetric/filter/means matrices); raw and covariance input — but in the old Mx file format.
- **Notes:** Kept as reference/conversion targets; the OpenMx harness cannot run them directly. Useful as round-trip import targets for a "portable SEM lingua franca."

---

## 12. Cross-cutting feature → model index

Conceptual capabilities the schema/converter must support, and where they surface. (Capabilities, not API names.)

| Capability | Models requiring it |
|---|---|
| Summary-covariance (+means) likelihood | Saturated (1.x), Regression (2.1), CFA (3.1), LGCM-cov (5.1), LISREL (3.3), PPML (11.8) |
| Raw-data full-information likelihood (FIML), missingness-tolerant | Nearly all raw variants; mandatory for ordinal (4.x), growth (5.x), multilevel (7.x), state-space (6.1), twin (9.1) |
| Latent variables / reflective loadings | CFA (3.1–3.6), LGCM (5.1), LISREL (3.3), IRT (10.1), multilevel CFA (7.1), STARTS (5.4) |
| Directed (asymmetric) structural paths | Regression (2.x), mediation (3.2), autoregressive (5.3), state-space (6.1), VAR (7.5) |
| Means / intercept model | Regression (2.x), growth (5.1), twin (9.1), definition-means (11.1), most raw variants |
| Scale identification (fixed loading vs fixed variance vs fixed thresholds) | CFA (3.1), ordinal (4.1) |
| Definition variables (per-observation parameters from data) | Definition-variable models (11.1), moderation (3.4), autoregressive-tree (5.3), HMM-defvar (8.4), continuous-time intervals (6.1), GEE (2.3), WLS exo-predictors (11.2), def-var-zygosity ACE (9.1) |
| Multiple groups with cross-group equality | Twin ACE (9.1), heterogeneity (3.x/9.x), multigroup ML/RAM (3.x), IRT multigroup (10.1), multigroup WLS (11.2) |
| Equality constraints via shared parameter naming (vs explicit constraint equations) | MLVAR stationarity (7.5), LGCM equal residuals (5.1), twin (9.1) |
| Nonlinear equality/inequality constraints | Locus likelihoods (9.4), constraint-driven (11.4), nuclear twin family (9.2), sum-to-one ACE (9.1) |
| Ordinal / threshold liabilities; multivariate-normal orthant integration | Ordinal & joint models (4.1), polychoric (4.2), ordinal twin (9.1), IRT (10.1) |
| Threshold ordering enforcement | Ordinal models (4.1, 4.2) |
| Weighted least squares to summary statistics | WLS family (11.2), joint-factor WLS (4.1) |
| Mixture: independent component models + estimated probability weights combined at row/group level | Finite mixture / LCA (8.1), growth mixture (8.2), regime-switching (8.3), uncertain-zygosity ACE (9.1) |
| Sequential latent-state (transition + emission) likelihood | HMM (8.4), state-space (6.1) |
| Kalman filtering / recursive prediction-error likelihood | State-space (6.1) |
| Matrix-exponential of a drift parameter × interval; off-path free parameters feeding computed values | Continuous-time state-space / CT-AR (6.1) |
| Time-valued loadings bound to data-derived time (order ≠ value) | LGCM (5.1), bivariate growth (5.2), nonstationary LGCM (5.1) |
| Replication of a sub-model a data-determined number of times (generative dimension) | LGCM (5.1), VAR (7.5), burst (7.6), cross-classified (7.3) |
| Nested replication accumulating multiple coordinates | Burst design (7.6), multilevel CFA (7.1) |
| One-to-many fan-out from a singleton module into every instance of a series | Nonstationary LGCM (5.1), bivariate growth anchors (5.2) |
| Relational covariance paths between members of the same grouping (self-pairing, non-nested) | Twin ACE (9.1), cross-classified (7.3) |
| Hierarchical/relational joins with keys; structural-symmetry exploitation (rampart) | Multilevel (7.1–7.4), rampart (7.4) |
| Marginal ML via numerical integration over latent traits (quadrature + EM) | IRT/IFA (10.1) |
| Large structured relatedness covariance over one "row" (GREML) | GREML (9.3) |
| Link functions (nonlinear mean link, variance function) | GEE (2.3) |
| Likelihood-based confidence intervals (incl. boundary-corrected) | CI-bearing variants throughout (3.1, 5.1, 9.1, 11.1, 11.9) |
| User-defined per-row likelihood / custom objective | Custom row-likelihood (11.3), LISREL user-objective (3.3), locus (9.4) |
| Observation-level weighting | Survey-weighted regression (2.2) |
| Penalized/regularized objective | Regularized estimation (11.6) |
| Selection/range-restriction correction | Pearson selection (11.5) |
| Per-row / per-observation likelihood vector output | LikelihoodVector CFA (3.1), twin (9.1), row-objective (11.3) |
| Multiple imputation pooling | mice (11.7) |
| Optimizer-state checkpointing | SimpleCheckpoint (3.1) |

**Schema-relevance note.** Several capabilities are currently *not* first-class schema features and would today land in `@metadata$unsupported`: link functions (2.3), off-path free parameters feeding computed expressions and matrix-valued computed values (6.1), operator nodes for algebra-defined covariances (9.2, 9.4), priors, and 0-arrow paths. The `[edge]` state-space and nuclear-twin-family cases are the sharpest tests of those gaps.

In the target design (`SCHEMA-DESIGN.md`, `schemaVersion: 1`), matrix algebra, non-path parameters, and link functions are **in scope** (covering 2.3, 6.1, 9.2, 9.4 once built); operator nodes, general aggregation, and custom objectives are **deferred**; priors are stored model content. Until then these remain `@metadata$unsupported` round-trip cases in `schemaVersion: 0`.

---

## 13. Excluded as software-internal (not modeling)

Catalogued only as patterns, since they exercise the optimizer/engine rather than a statistical model:

- **Optimizer / solver mechanics:** Nelder-Mead and CSOLNP/NPSOL/GenSA tuning, warm starts, try-hard, grid evaluation, optimizer-tolerance, starting-value assignment, Bukin/Powell benchmarks, active-bounds/Hessian tests, jiggle.
- **Algebra / derivative mechanics:** algebra derivatives, transformations, error detection, partial-analytic/on-demand algebra, substitutions, derivative filters, auto-gradient checks, matrix-algebra demos (`MatrixAlgebra.R`).
- **Standard-error / Hessian / vcov / CI plumbing:** `*TestSE`, robust-SE, information-matrix, CI-duplicate and ignore-fixed mechanics, Fisher-information IFA checks.
- **Bootstrap / rerun / power plumbing:** bootstrap LR/parallel, model-rerun checks, power detail, modification-index checks, multimodel-inference plumbing.
- **Validation / naming / model-surgery / I/O:** error-condition and error-checking tests, name/reference overlap, path-removal/transform, summary/version/log, matrix/path/data-frame creation, `RAM_paths_dont_overwrite`, classic-`.mx` files (kept in §11.10 only as conversion targets), `invert.R` matrix-inversion benchmark, `enormous/lib/stderrlib.R` SE-simulation harness, PPML peeling internals, skipped-row/data-handling checks, and raw data artifacts.

---

*Generated by surveying: drawSEM `edge-cases/` across all branches (richest on `modular`); the curated `OpenMx Model Examples/*.R` demos; and `models/{passing,nightly,failing,codeRed,enormous}`. No code or schema reproduced; annotations are conceptual.*
