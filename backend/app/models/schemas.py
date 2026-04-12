"""Pydantic models — the single source of truth for all API contracts.

These models mirror the data structures in the frontend monolith
(sc-disruption-map.jsx) and define the shapes that the API serves.
Frontend TypeScript types can be generated from the OpenAPI spec
that FastAPI produces from these models automatically.
"""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


# ── Reference data ──────────────────────────────────────────────


class Site(BaseModel):
    """An SKF factory, office, logistics hub, or sales location."""

    name: str
    lat: float
    lng: float
    type: Literal["mfg", "log", "admin", "va", "service", "sales", "other"]
    country: str
    iso: str = Field(description="ISO 3166-1 alpha-2 country code")
    region: Literal["EU", "APAC", "AM", "MEA", "AF"]
    business_unit: Optional[str] = Field(
        None, description="BU key: ind, sis-seal, sis-lube, sis-aero, sis-mag"
    )
    address: Optional[str] = None


class SiteStats(BaseModel):
    by_type: dict[str, int]
    by_region: dict[str, int]
    countries: int


class SitesResponse(BaseModel):
    sites: list[Site]
    stats: SiteStats


class TeamMember(BaseModel):
    id: str
    name: str
    role: str
    initials: str
    color: str


class TeamResponse(BaseModel):
    members: list[TeamMember]


# ── Supplier data ───────────────────────────────────────────────


class SupplierCategory(BaseModel):
    """L1 category with L2 breakdown."""

    key: str = Field(description="Short key: Comp, MFG Svc, Elec, etc.")
    full_name: str
    count: int
    subcategories: list[tuple[str, int]]


class Supplier(BaseModel):
    """Aggregated supplier data per country."""

    country: str
    lat: float
    lng: float
    count: int = Field(description="Number of distinct suppliers")
    relationships: int = Field(description="Number of supply relationships")
    region: str
    top_categories: list[str]


class SuppliersResponse(BaseModel):
    suppliers: list[Supplier]
    total: int
    max_count: int


class SupplierDetailResponse(BaseModel):
    country: str
    categories: list[SupplierCategory]


# ── Routes & geography ──────────────────────────────────────────


class SeaRoute(BaseModel):
    pts: list[list[float]] = Field(description="[[lat, lng], ...] waypoints")
    label: str
    corridor: str
    type: Literal["sea"] = "sea"
    origin: str


class AirRoute(BaseModel):
    f: list[float] = Field(description="[lat, lng] origin")
    t: list[float] = Field(description="[lat, lng] destination")
    label: str
    corridor: str
    type: Literal["air"] = "air"
    origin: str


class Chokepoint(BaseModel):
    name: str
    lat: float
    lng: float


class Port(BaseModel):
    name: str
    lat: float
    lng: float


class Airport(BaseModel):
    name: str
    lat: float
    lng: float


class GeographyResponse(BaseModel):
    chokepoints: list[Chokepoint]
    ports: list[Port]
    airports: list[Airport]


class RoutesResponse(BaseModel):
    sea_routes: list[SeaRoute]
    air_routes: list[AirRoute]


# ── Supply chain graph ──────────────────────────────────────────


class SupplyChainNode(BaseModel):
    """A factory's supply chain: upstream suppliers, inputs, business unit."""

    factory: str
    business_unit: str
    supplier_countries: list[str]
    inputs: list[str]


class SupplyChainResponse(BaseModel):
    nodes: list[SupplyChainNode]


class ImpactChain(BaseModel):
    """Result of impact analysis for a disruption event.

    Mirrors the output of computeImpact() in the monolith.
    """

    routes: list[int] = Field(description="Indices of affected route objects")
    factories: list[str]
    suppliers: list[str]
    region: Optional[str] = None
    corridors: list[str]


# ── Computed severity ──────────────────────────────────────────


class SeverityComponents(BaseModel):
    """Individual component scores of the algorithmic severity formula."""

    magnitude: float = Field(ge=0, le=1, description="Event scale/scope (0-1)")
    proximity: float = Field(ge=0, le=1, description="Haversine distance from nearest SKF mfg site (0-1)")
    asset_criticality: float = Field(ge=0, le=1, description="Site type weighting: mfg > aerospace > logistics > sales (0-1)")
    supply_chain_impact: float = Field(ge=0, le=1, description="Affected routes and supplier density (0-1)")


class RoutingDependency(BaseModel):
    """Routing dependency context explaining why proximity scored high."""

    score: float = Field(ge=0, le=1, description="Routing dependency score (0-1)")
    reasons: list[str] = Field(description="Human-readable reasons for the routing dependency score")


class ComputedSeverity(BaseModel):
    """Algorithmic severity score computed by the severity engine.

    Returned as `computed_severity` on every scan item. Formula:
    score = (0.30 * magnitude + 0.25 * proximity + 0.25 * asset_criticality
             + 0.20 * supply_chain_impact) * 100

    Practitioner dimensions decompose the score into decision-relevant axes:
    probability, impact_magnitude, velocity, and recovery_estimate.
    """

    score: float = Field(ge=0, le=100, description="Composite severity score (0-100)")
    label: Literal["Critical", "High", "Medium", "Low"] = Field(
        description="Derived label: Critical >= 75, High >= 50, Medium >= 25, Low < 25"
    )
    components: SeverityComponents
    affected_site_count: int = Field(ge=0, description="Number of SKF sites within blast radius")
    # Practitioner severity dimensions
    probability: float = Field(default=0.0, ge=0, le=1, description="Likelihood of occurrence (0-1)")
    impact_magnitude: float = Field(default=0.0, ge=0, le=1, description="Scale of impact on SKF operations (0-1)")
    velocity: str = Field(default="unknown", description="Speed of onset: immediate, days, weeks, months")
    recovery_estimate: str = Field(default="unknown", description="Expected recovery horizon: hours, days, weeks, months")
    # Routing dependency context (present when route-based scoring was used)
    routing_dependency: Optional[RoutingDependency] = Field(
        None, description="Routing dependency context — explains why proximity scored high due to logistics route exposure"
    )


# ── Disruption events & scanning ────────────────────────────────


class AffectedSite(BaseModel):
    """An SKF site affected by a disruption event."""

    name: str
    type: Literal["mfg", "log", "admin", "va", "service", "sales", "other"]
    distance_km: float = Field(description="Distance from disruption epicenter in km (0 = direct impact)")


class AffectedSuppliers(BaseModel):
    """Summary of suppliers affected by a disruption."""

    count: int
    countries: list[str]


class DisruptionImpact(BaseModel):
    """Structured impact assessment for a disruption event."""

    affected_sites: list[AffectedSite]
    affected_suppliers: AffectedSuppliers
    estimated_units_per_week: int = Field(description="Estimated bearing units/week at risk")
    recovery_weeks_with_mitigation: int
    recovery_weeks_without: int


class RecommendedAction(BaseModel):
    """A prioritized recommended action for a disruption event."""

    priority: int = Field(ge=1, description="1 = highest priority")
    action: str
    owner: str = Field(description="Responsible team or function")
    urgency: str = Field(description="immediate | 24h | 48h | 1w | 1m | 3m | ongoing | contingent")


class DisruptionEvent(BaseModel):
    """A disruption detected by the AI scanner."""

    id: str = Field(description="Stable ID: event|region")
    event: str
    description: str
    category: str
    severity: Literal["Critical", "High", "Medium", "Low"]
    trend: str
    region: str
    lat: float
    lng: float
    skf_exposure: str
    recommended_action: str
    # Lifecycle
    status: Literal["active", "watching", "archived"] = "active"
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    scan_count: int = 0
    # Structured recommendations (v2)
    impact: Optional[DisruptionImpact] = None
    actions: Optional[list[RecommendedAction]] = None
    confidence: Optional[float] = Field(None, ge=0, le=1, description="AI confidence score")
    sources: Optional[list[str]] = None


class EventRecommendationsResponse(BaseModel):
    """Response for GET /events/{event_id}/recommendations."""

    event_id: str
    event: str
    severity: str
    impact: DisruptionImpact
    actions: list[RecommendedAction]
    confidence: float
    sources: list[str]
    skf_exposure: str


class GeopoliticalRisk(BaseModel):
    """A geopolitical risk assessment."""

    id: str
    risk: str
    trend: str
    trend_arrow: str
    this_week: str
    skf_relevance: str
    risk_level: Literal["Critical", "High", "Medium", "Low"]
    region: str
    lat: float
    lng: float
    watchpoint: str
    # Lifecycle
    status: Literal["active", "watching", "archived"] = "active"
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    scan_count: int = 0
    # Structured recommendations (v2)
    impact: Optional[DisruptionImpact] = None
    actions: Optional[list[RecommendedAction]] = None
    confidence: Optional[float] = Field(None, ge=0, le=1, description="AI confidence score")
    sources: Optional[list[str]] = None


class TradeEvent(BaseModel):
    """A trade policy / tariff event."""

    id: str
    event: str
    description: str
    category: str
    severity: Literal["Critical", "High", "Medium", "Low"]
    trend: str
    region: str
    lat: float
    lng: float
    corridor: str
    friction_level: Literal["Free", "Low", "Moderate", "High", "Prohibitive"]
    skf_cost_impact: str
    recommended_action: str
    # Lifecycle
    status: Literal["active", "watching", "archived"] = "active"
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    scan_count: int = 0
    # Structured recommendations (v2)
    impact: Optional[DisruptionImpact] = None
    actions: Optional[list[RecommendedAction]] = None
    confidence: Optional[float] = Field(None, ge=0, le=1, description="AI confidence score")
    sources: Optional[list[str]] = None


ScanMode = Literal["disruptions", "geopolitical", "trade"]


class ScanRequest(BaseModel):
    mode: ScanMode


class ScanStatusResponse(BaseModel):
    scan_id: str
    mode: ScanMode
    status: Literal["running", "completed", "failed"]
    progress: int = Field(ge=0, le=100)
    started_at: datetime
    completed_at: Optional[datetime] = None


class ScanResultResponse(BaseModel):
    """Latest cached scan results."""

    mode: ScanMode
    scanned_at: Optional[datetime] = None
    disruptions: Optional[list[DisruptionEvent]] = None
    geopolitical: Optional[list[GeopoliticalRisk]] = None
    trade: Optional[list[TradeEvent]] = None


# ── SSE streaming (v2) ──────────────────────────────────────────


class ScanStreamEvent(BaseModel):
    """Shape of each SSE data frame during a streaming scan."""

    items: list[dict]  # Union of event types
    progress: int
    phase: str = Field(description="scanning | processing | complete")


# ── Tickets ─────────────────────────────────────────────────────


TicketPriority = Literal["critical", "high", "normal", "low"]


class Ticket(BaseModel):
    id: int
    event_id: str
    owner: Optional[str] = Field(None, description="Team member ID")
    status: Literal["open", "assigned", "in_progress", "blocked", "done"] = "open"
    notes: Optional[str] = None
    due_date: Optional[datetime] = Field(None, description="ISO datetime deadline for SLA tracking")
    priority: Optional[TicketPriority] = Field(None, description="Ticket priority: critical, high, normal, low")
    is_overdue: bool = Field(False, description="True if due_date is past and status is not done")
    created_at: datetime
    updated_at: datetime


class TicketCreate(BaseModel):
    event_id: str
    owner: Optional[str] = None
    notes: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: Optional[TicketPriority] = None


class TicketUpdate(BaseModel):
    owner: Optional[str] = None
    status: Optional[Literal["open", "assigned", "in_progress", "blocked", "done"]] = (
        None
    )
    notes: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: Optional[TicketPriority] = None


class TicketsResponse(BaseModel):
    tickets: list[Ticket]


# ── Event registry (lifecycle state) ────────────────────────────


class EventRegistryEntry(BaseModel):
    event_id: str
    status: Literal["active", "watching", "archived"]
    first_seen: datetime
    last_seen: datetime
    scan_count: int
    last_severity: str
    archived_severity: Optional[str] = None


class EventEdit(BaseModel):
    """User override of an AI-generated field."""

    event_id: str
    field: str
    original_value: str
    edited_value: str
    edited_at: datetime
    edited_by: str = "jh"  # Default to Jonas


# ── Health ──────────────────────────────────────────────────────


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "0.1.0"
    database: str = "connected"


# ── Supplier alternatives ─────────────────────────────────────


class DisruptedSupplierSummary(BaseModel):
    """Summary of supplier presence in the disrupted country/region."""

    country: Optional[str] = Field(None, description="Disrupted country (if country-level query)")
    region: Optional[str] = Field(None, description="Disrupted region (if region-level query)")
    supplier_count: int = Field(description="Total suppliers in disrupted area")
    categories: list[str] = Field(description="All supplier categories present in disrupted area")


class SupplierAlternative(BaseModel):
    """A candidate alternative sourcing country."""

    country: str
    region: str
    supplier_count: int = Field(description="Number of suppliers in this country")
    distance_km: float = Field(description="Haversine distance from disrupted centroid in km")
    category_overlap: list[str] = Field(description="Categories that match the disrupted area")
    overlap_pct: float = Field(
        ge=0, le=100,
        description="Percentage of disrupted categories covered by this alternative",
    )


# ── Event feedback (accuracy tracking) ───────────────────────


class EventFeedbackCreate(BaseModel):
    """User feedback on whether a detected event was accurate."""

    outcome: Literal["true_positive", "false_positive", "missed"]
    actual_impact: Optional[str] = Field(None, description="Free-text description of what actually happened")
    feedback_by: str = Field(default="unknown", description="User or team who provided feedback")


class EventFeedback(BaseModel):
    """Stored feedback record."""

    id: int
    event_id: str
    outcome: Literal["true_positive", "false_positive", "missed"]
    actual_impact: Optional[str] = None
    feedback_by: str = "unknown"
    created_at: datetime


class FeedbackStats(BaseModel):
    """Aggregate accuracy statistics across all event feedback."""

    total: int = Field(description="Total feedback entries")
    true_positive_count: int
    false_positive_count: int
    missed_count: int
    precision_pct: Optional[float] = Field(
        None,
        description="true_positives / (true_positives + false_positives) * 100, null if no data",
    )


class SupplierAlternativesResponse(BaseModel):
    """Response for GET /suppliers/alternatives — regional supplier alternatives."""

    disrupted: DisruptedSupplierSummary
    alternatives: list[SupplierAlternative]
    disclaimer: str = Field(
        default="Regional alternatives based on supplier density and category overlap. "
        "These are NOT confirmed site-level mappings — verify with procurement before acting.",
    )


# ── Structured actions (workflow tracking) ──────────────────────


ActionType = Literal[
    "activate_backup_supplier",
    "increase_safety_stock",
    "reroute_shipment",
    "contact_supplier",
    "monitor_situation",
    "escalate_to_leadership",
    "file_insurance_claim",
    "activate_bcp",
]

ActionStatus = Literal["pending", "in_progress", "completed", "dismissed"]
ActionPriority = Literal["critical", "high", "normal", "low"]


class Action(BaseModel):
    """A structured, trackable action linked to a disruption event."""

    id: int
    event_id: str
    action_type: ActionType
    title: str
    description: Optional[str] = None
    assignee_hint: Optional[str] = Field(None, description="Suggested owner team/role")
    priority: ActionPriority = "normal"
    status: ActionStatus = "pending"
    due_date: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class ActionCreate(BaseModel):
    """Create a new action manually."""

    action_type: ActionType
    title: Optional[str] = None
    description: Optional[str] = None
    assignee_hint: Optional[str] = None
    priority: ActionPriority = "normal"
    due_date: Optional[datetime] = None


class ActionUpdate(BaseModel):
    """Update an existing action."""

    status: Optional[ActionStatus] = None
    assignee_hint: Optional[str] = None
    priority: Optional[ActionPriority] = None
    due_date: Optional[datetime] = None
