import pathlib, re, json, math

ROOT = pathlib.Path(__file__).resolve().parents[1]

def parse(text):
    stack = [[]]
    for match in re.finditer(r'\(|\)|"(?:\\.|[^"\\])*"|[^\s()]+', text):
        token = match.group()
        if token == '(':
            item = []
            stack[-1].append(item)
            stack.append(item)
        elif token == ')':
            stack.pop()
        else:
            stack[-1].append(json.loads(token) if token.startswith('"') else token)
    assert len(stack) == 1
    return stack[0][0]

def many(node, key):
    return [x for x in node if isinstance(x, list) and x and x[0] == key]

def one(node, key, default=None):
    result = many(node, key)
    return result[0][1:] if result else default

def components(tree):
    result = []
    for fp in many(tree, 'footprint') + many(tree, 'module'):
        props = {p[1]:p[2] for p in many(fp, 'property')}
        props.update({p[1].capitalize():p[2] for p in many(fp,'fp_text') if p[1] in ('reference','value')})
        result.append({'ref':props.get('Reference'), 'value':props.get('Value'), 'footprint':fp[1], 'pads':len(many(fp,'pad')), 'at':one(fp,'at'), 'node':fp})
    return result
