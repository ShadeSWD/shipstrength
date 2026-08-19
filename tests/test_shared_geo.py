# -*- coding: utf-8 -*-
"""Локальная копия общего движка эпюров не должна расходиться с мастером.

Мастер кластера — cluster-infra/shared/geo.js; раскладывается по репозиториям
скриптом cluster-infra/tools/sync-shared.py. Репозиторий самодостаточен и
собирается без кластера, поэтому вне кластера (в CI, у стороннего
разработчика) мастера просто нет — тогда тест пропускается.
"""
import os

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCAL = os.path.join(ROOT, 'site', 'assets', 'geo.js')
MASTER = os.environ.get(
    'CLUSTER_GEO_MASTER', '/root/cluster-infra/shared/geo.js')


def test_local_copy_exists():
    assert os.path.isfile(LOCAL), 'нет site/assets/geo.js'


@pytest.mark.skipif(not os.path.isfile(MASTER),
                    reason='мастер cluster-infra/shared/geo.js недоступен')
def test_geo_matches_master():
    with open(MASTER, encoding='utf-8') as fh:
        master = fh.read()
    with open(LOCAL, encoding='utf-8') as fh:
        local = fh.read()
    assert local == master, (
        'site/assets/geo.js разошёлся с мастером cluster-infra/shared/geo.js; '
        'правьте мастер и запускайте cluster-infra/tools/sync-shared.py geo')
