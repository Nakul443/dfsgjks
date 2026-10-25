# this file is responsible for implementing a simple in-memory LRU cache to store
# and retrieve computed results based on query parameters.

from collections import OrderedDict
from typing import Any


class SimpleCache:
    """
    Lightweight in-memory LRU cache keyed by (endpoint, start, end, cutoff).
    Avoids recalculating series and metrics for identical query params.
    """

    def __init__(self, maxsize: int = 256) -> None:
        self.maxsize = maxsize
        self._cache: OrderedDict[tuple[Any, ...], Any] = OrderedDict()

    def get(self, key: tuple[Any, ...]) -> Any | None:
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]
        return None

    def set(self, key: tuple[Any, ...], value: Any) -> None:
        if key in self._cache:
            self._cache.move_to_end(key)
        self._cache[key] = value
        if len(self._cache) > self.maxsize:
            self._cache.popitem(last=False)

    def clear(self) -> None:
        self._cache.clear()


cache = SimpleCache()
