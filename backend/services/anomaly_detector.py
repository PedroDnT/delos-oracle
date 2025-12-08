"""
DELOS Anomaly Detector
Statistical anomaly detection for rate changes.

Detects:
- Value spikes: Rate value > N standard deviations from historical mean
- Stale data: Data age exceeds heartbeat threshold
- Velocity: Rate of change exceeds threshold

Anomalies are logged but DO NOT block updates (monitoring only).
"""

import logging
import statistics
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import List, Optional

logger = logging.getLogger(__name__)


@dataclass
class AnomalyResult:
    """Result of an anomaly detection check."""
    is_anomaly: bool
    anomaly_type: Optional[str]  # 'value_spike', 'stale_data', 'velocity'
    current_value: float
    mean: float
    std_dev: float
    z_score: float
    message: str

    @property
    def severity(self) -> str:
        """Get severity level based on z_score."""
        if not self.is_anomaly:
            return "normal"
        if self.z_score > 5:
            return "critical"
        if self.z_score > 4:
            return "high"
        return "medium"


class AnomalyDetector:
    """
    Statistical anomaly detection for rate data.

    Detects unusual patterns in rate values that may indicate
    data quality issues, API errors, or market anomalies.

    Usage:
        detector = AnomalyDetector(std_threshold=3.0, lookback_days=30)

        # Check for value anomaly
        result = detector.detect_value_anomaly(
            current_value=15.0,
            historical_values=[10.0, 10.2, 10.1, 10.3, 10.0]
        )

        if result.is_anomaly:
            print(f"Anomaly: {result.message}")
    """

    def __init__(
        self,
        std_threshold: float = 3.0,
        lookback_days: int = 30,
        velocity_threshold: float = 0.5,
        min_history_size: int = 5,
    ):
        """
        Initialize anomaly detector.

        Args:
            std_threshold: Number of standard deviations to flag as anomaly
            lookback_days: Days of history to consider
            velocity_threshold: Maximum allowed daily change rate (0.5 = 50%)
            min_history_size: Minimum history size for reliable detection
        """
        self.std_threshold = std_threshold
        self.lookback_days = lookback_days
        self.velocity_threshold = velocity_threshold
        self.min_history_size = min_history_size

    def detect_value_anomaly(
        self,
        current_value: float,
        historical_values: List[float]
    ) -> AnomalyResult:
        """
        Detect if current value is statistically anomalous.

        Checks if the current value is more than N standard deviations
        from the historical mean.

        Args:
            current_value: The new rate value to check
            historical_values: List of recent historical values

        Returns:
            AnomalyResult with detection details
        """
        # Need sufficient history for meaningful statistics
        if len(historical_values) < self.min_history_size:
            return AnomalyResult(
                is_anomaly=False,
                anomaly_type=None,
                current_value=current_value,
                mean=current_value,
                std_dev=0,
                z_score=0,
                message=f"Insufficient history ({len(historical_values)} < {self.min_history_size})"
            )

        # Calculate statistics
        mean = statistics.mean(historical_values)
        std_dev = statistics.stdev(historical_values)

        # Handle zero std dev (all values identical)
        if std_dev == 0:
            # Any different value is technically an anomaly
            is_anomaly = current_value != mean
            z_score = float('inf') if is_anomaly else 0
            return AnomalyResult(
                is_anomaly=is_anomaly,
                anomaly_type="value_spike" if is_anomaly else None,
                current_value=current_value,
                mean=mean,
                std_dev=0,
                z_score=z_score if z_score != float('inf') else 999,
                message=f"Value {current_value} differs from constant {mean}"
            )

        # Calculate z-score
        z_score = abs(current_value - mean) / std_dev
        is_anomaly = z_score > self.std_threshold

        # Determine direction of anomaly
        direction = "above" if current_value > mean else "below"

        return AnomalyResult(
            is_anomaly=is_anomaly,
            anomaly_type="value_spike" if is_anomaly else None,
            current_value=current_value,
            mean=mean,
            std_dev=std_dev,
            z_score=z_score,
            message=(
                f"Value {current_value:.4f} is {z_score:.2f} std devs {direction} "
                f"mean {mean:.4f} (threshold: {self.std_threshold})"
            )
        )

    def detect_stale_data(
        self,
        last_update: datetime,
        heartbeat_seconds: int
    ) -> AnomalyResult:
        """
        Detect if data is stale (exceeds heartbeat threshold).

        Args:
            last_update: Timestamp of last update
            heartbeat_seconds: Maximum expected time between updates

        Returns:
            AnomalyResult indicating staleness
        """
        now = datetime.now()
        age_seconds = (now - last_update).total_seconds()
        is_stale = age_seconds > heartbeat_seconds

        # Calculate how many heartbeats overdue
        heartbeat_ratio = age_seconds / heartbeat_seconds if heartbeat_seconds > 0 else 0

        return AnomalyResult(
            is_anomaly=is_stale,
            anomaly_type="stale_data" if is_stale else None,
            current_value=age_seconds,
            mean=heartbeat_seconds,
            std_dev=0,
            z_score=heartbeat_ratio,
            message=(
                f"Data age {age_seconds/3600:.1f}h "
                f"{'exceeds' if is_stale else 'within'} "
                f"heartbeat {heartbeat_seconds/3600:.1f}h "
                f"({heartbeat_ratio:.1f}x)"
            )
        )

    def detect_velocity_anomaly(
        self,
        current_value: float,
        previous_value: float,
        time_delta_hours: float = 24
    ) -> AnomalyResult:
        """
        Detect abnormal rate of change.

        Flags if the value changed by more than the velocity threshold
        in the given time period.

        Args:
            current_value: New value
            previous_value: Previous value
            time_delta_hours: Time between values in hours

        Returns:
            AnomalyResult indicating velocity anomaly
        """
        # Handle edge cases
        if previous_value == 0:
            if current_value == 0:
                return AnomalyResult(
                    is_anomaly=False,
                    anomaly_type=None,
                    current_value=current_value,
                    mean=previous_value,
                    std_dev=0,
                    z_score=0,
                    message="Both values are zero"
                )
            # Previous was zero, any change is technically infinite
            return AnomalyResult(
                is_anomaly=True,
                anomaly_type="velocity",
                current_value=current_value,
                mean=previous_value,
                std_dev=0,
                z_score=999,
                message=f"Value changed from 0 to {current_value}"
            )

        # Calculate percentage change
        change_rate = abs(current_value - previous_value) / abs(previous_value)

        # Normalize to daily rate
        daily_change = change_rate * (24 / time_delta_hours) if time_delta_hours > 0 else change_rate

        is_anomaly = daily_change > self.velocity_threshold
        velocity_ratio = daily_change / self.velocity_threshold if self.velocity_threshold > 0 else 0

        direction = "increase" if current_value > previous_value else "decrease"

        return AnomalyResult(
            is_anomaly=is_anomaly,
            anomaly_type="velocity" if is_anomaly else None,
            current_value=current_value,
            mean=previous_value,
            std_dev=0,
            z_score=velocity_ratio,
            message=(
                f"Daily {direction} rate {daily_change*100:.1f}% "
                f"{'exceeds' if is_anomaly else 'within'} "
                f"threshold {self.velocity_threshold*100:.1f}%"
            )
        )

    def run_all_checks(
        self,
        current_value: float,
        historical_values: List[float],
        last_update: Optional[datetime] = None,
        heartbeat_seconds: Optional[int] = None,
        previous_value: Optional[float] = None,
        time_delta_hours: float = 24
    ) -> List[AnomalyResult]:
        """
        Run all applicable anomaly checks.

        Args:
            current_value: Current rate value
            historical_values: Historical values for statistics
            last_update: Timestamp of last update (for stale check)
            heartbeat_seconds: Heartbeat threshold (for stale check)
            previous_value: Previous value (for velocity check)
            time_delta_hours: Time delta for velocity check

        Returns:
            List of AnomalyResult for each check that found an anomaly
        """
        anomalies = []

        # Value anomaly check
        value_result = self.detect_value_anomaly(current_value, historical_values)
        if value_result.is_anomaly:
            anomalies.append(value_result)
            logger.warning(
                f"Value anomaly detected: {value_result.message}",
                extra={"anomaly_type": "value_spike", "z_score": value_result.z_score}
            )

        # Stale data check
        if last_update is not None and heartbeat_seconds is not None:
            stale_result = self.detect_stale_data(last_update, heartbeat_seconds)
            if stale_result.is_anomaly:
                anomalies.append(stale_result)
                logger.warning(
                    f"Stale data detected: {stale_result.message}",
                    extra={"anomaly_type": "stale_data", "z_score": stale_result.z_score}
                )

        # Velocity check
        if previous_value is not None:
            velocity_result = self.detect_velocity_anomaly(
                current_value, previous_value, time_delta_hours
            )
            if velocity_result.is_anomaly:
                anomalies.append(velocity_result)
                logger.warning(
                    f"Velocity anomaly detected: {velocity_result.message}",
                    extra={"anomaly_type": "velocity", "z_score": velocity_result.z_score}
                )

        return anomalies

    def get_expected_range(
        self,
        historical_values: List[float]
    ) -> tuple[float, float]:
        """
        Calculate expected range for a rate based on history.

        Args:
            historical_values: Historical values

        Returns:
            Tuple of (lower_bound, upper_bound)
        """
        if len(historical_values) < self.min_history_size:
            if historical_values:
                return (min(historical_values), max(historical_values))
            return (0, 0)

        mean = statistics.mean(historical_values)
        std_dev = statistics.stdev(historical_values)

        lower = mean - (self.std_threshold * std_dev)
        upper = mean + (self.std_threshold * std_dev)

        return (lower, upper)
