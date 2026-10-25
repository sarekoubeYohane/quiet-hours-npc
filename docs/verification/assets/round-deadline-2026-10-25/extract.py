"""Allowlist-only extraction from the two private observation ZIPs.
Usage: python extract.py <pr162-private-complete.zip> <npc-loop-20261025-private.zip>
Prints no transcript, memory text, scope, credential, or raw operation ID.
"""
import hashlib
import json
import sys
import zipfile


def read_package(path, name):
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        raw = archive.read(name)
        digest = hashlib.sha256(raw).hexdigest()
        assert digest == json.loads(archive.read('manifest.json'))[name]
        return json.loads(raw), digest


def story(value):
    return {k: v for k, v in value.items() if k != 'aiUsage'}


def extract(label, package, digest, round_key, end_key):
    baseline, result, end = package['baseline'], package[round_key], package[end_key]
    trace = result['decisionTrace']
    base = trace['acceptedAt']
    assert story(baseline['world']) == story(end['world'])
    assert trace['outcome'] == 'rolled-back'
    assert result['operation']['status'] == 502
    assert len(trace['dispatches']) == 8
    assert trace['gaps'] == [] and trace['redacted'] is False
    npc_checks = []
    for d in trace['dispatches']:
        if d['task'] != 'npc':
            continue
        request = json.loads(d['requestBody'])
        view = json.loads(request['messages'][1]['content'])
        schema = request['response_format']['json_schema']
        visible = {(x['id'], x['version']) for x in view['self']['shortTerm']}
        allowed = {(x['properties']['id']['enum'][0], x['properties']['version']['enum'][0])
                   for x in schema['schema']['properties']['memorySelections']['items']['anyOf']}
        chosen = {(x['id'], x['version']) for x in json.loads(d['rawCandidate'])['memorySelections']}
        assert visible == allowed and chosen <= visible and schema['strict']
        npc_checks.append({'sequence': d['sequence'], 'visibleCount': len(visible),
                           'selectedCount': len(chosen), 'valid': True})
    dispatches = [{
        'sequence': d['sequence'], 'task': d['task'], 'model': d['model'],
        'preparedMs': d['startedAt'] - base,
        'headersMs': d.get('headersReceivedAt', base) - base if 'headersReceivedAt' in d else None,
        'bodyObservedMs': d.get('receivedAt', base) - base if 'receivedAt' in d else None,
        'httpStatus': d.get('httpStatus'), 'failure': d.get('failure'),
        'inputTokens': d.get('usage', {}).get('inputTokens'),
        'outputTokens': d.get('usage', {}).get('outputTokens'),
    } for d in trace['dispatches']]
    steps = [{'kind': s['kind'], 'ms': s['at'] - base} for s in trace['steps']]
    completed = dispatches[:-1]
    windows = sum(d['bodyObservedMs'] - d['preparedMs'] for d in completed)
    gaps = completed[0]['preparedMs'] + sum(dispatches[i+1]['preparedMs'] - d['bodyObservedMs'] for i,d in enumerate(completed))
    assert windows + gaps == dispatches[-1]['preparedMs']
    known_in = sum(d['inputTokens'] or 0 for d in completed)
    known_out = sum(d['outputTokens'] or 0 for d in completed)
    old, new = baseline['world']['aiUsage'], end['world']['aiUsage']
    assert new['totalCalls'] - old['totalCalls'] == 8
    assert new['totalInputTokens'] - old['totalInputTokens'] == known_in
    assert new['totalOutputTokens'] - old['totalOutputTokens'] == known_out
    assert new['totalUnknownCalls'] - old['totalUnknownCalls'] == 1
    final_snapshot = trace['dispatches'][-1]['worldSnapshot']
    initial_ids = {o['id'] for o in baseline['world']['objects']}
    new_objects = [o for o in final_snapshot['objects'] if o['id'] not in initial_ids]
    assert any(o.get('state', {}).get('contents') == 'tea' for o in new_objects)
    assert any(o.get('state', {}).get('beverage') == 'tea' for o in new_objects)
    return {'case': label, 'privatePackageContentSHA256': digest, 'acceptedAt': base,
            'baseVersion': baseline['version'], 'endVersion': end['version'],
            'storyEqualExcludingUsage': True, 'npcReferenceChecks': npc_checks,
            'candidateNewCupAndTea': True, 'knownInputTokens': known_in,
            'knownOutputTokens': known_out, 'unknownUsageCalls': 1,
            'preparedToBodyWindowsMs': windows, 'outsideThoseWindowsBeforeLastPreparedMs': gaps,
            'dispatches': dispatches, 'steps': steps}


a, ha = read_package(sys.argv[1], 'pr162-complete-private.json')
b, hb = read_package(sys.argv[2], 'npc-loop-20261025-complete.json')
assert story(a['baseline']['world']) == story(b['baseline']['world'])
assert a['round1']['decisionTrace'] == b['prior']['decisionTrace']
print(json.dumps({'schemaVersion': 1, 'unit': 'milliseconds since trace acceptedAt',
                  'sameBaselineStory': True, 'priorTraceMatchesFirstFinal': True,
                  'observations': [extract('A / PR164', a, ha, 'round1', 'endWorld'),
                                   extract('B / PR165', b, hb, 'round', 'end')]}, indent=2))
