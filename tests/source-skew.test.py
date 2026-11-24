"""Run with KiCad's Python: python3 tests/source-skew.test.py."""
import math
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from source_skew import IU, distance, net_graph, pcbnew, point


class NativeCopperLengths(unittest.TestCase):
    def setUp(self):
        self.board = pcbnew.BOARD()
        self.net = pcbnew.NETINFO_ITEM(self.board, 'DDR')
        self.board.Add(self.net)

    def xy(self, x, y):
        return pcbnew.VECTOR2I(round(x * IU), round(y * IU))

    def pad(self, x, y, layer=pcbnew.F_Cu):
        footprint = pcbnew.FOOTPRINT(self.board)
        self.board.Add(footprint)
        pad = pcbnew.PAD(footprint)
        pad.SetNumber('1')
        pad.SetPosition(self.xy(x, y))
        pad.SetSize(self.xy(.4, .4))
        pad.SetShape(pcbnew.PAD_SHAPE_CIRCLE)
        layers = pcbnew.LSET()
        layers.AddLayer(layer)
        pad.SetLayerSet(layers)
        pad.SetNet(self.net)
        footprint.Add(pad)
        return point(pad.GetPosition(), layer)

    def track(self, start, end, layer=pcbnew.F_Cu):
        track = pcbnew.PCB_TRACK(self.board)
        track.SetStart(self.xy(*start))
        track.SetEnd(self.xy(*end))
        track.SetWidth(round(.1 * IU))
        track.SetLayer(layer)
        track.SetNet(self.net)
        self.board.Add(track)

    def test_pad_touching_middle_of_track(self):
        start, end = self.pad(0, .2), self.pad(1, 0)
        self.track((-1, 0), (1, 0))
        self.assertAlmostEqual(distance(net_graph(self.board, 'DDR'), start, end), 1.2)

    def test_via_touching_pad_edge_counts_center_approach(self):
        start, end = self.pad(1, 0), self.pad(.7, 1.3, pcbnew.B_Cu)
        via = pcbnew.PCB_VIA(self.board)
        via.SetPosition(self.xy(.7, .3))
        via.SetWidth(round(.45 * IU))
        via.SetDrill(round(.2 * IU))
        via.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu)
        via.SetNet(self.net)
        self.board.Add(via)
        self.track((.7, .3), (.7, 1.3), pcbnew.B_Cu)
        self.assertAlmostEqual(distance(net_graph(self.board, 'DDR'), start, end), 1 + math.hypot(.3, .3))

    def test_arc_uses_curve_length(self):
        start, end = self.pad(1, 0), self.pad(-1, 0)
        arc = pcbnew.PCB_ARC(self.board)
        arc.SetStart(self.xy(1, 0))
        arc.SetMid(self.xy(0, 1))
        arc.SetEnd(self.xy(-1, 0))
        arc.SetWidth(round(.1 * IU))
        arc.SetLayer(pcbnew.F_Cu)
        arc.SetNet(self.net)
        self.board.Add(arc)
        self.assertAlmostEqual(distance(net_graph(self.board, 'DDR'), start, end), math.pi, places=6)

    def test_same_xy_on_other_layer_is_not_connected(self):
        start, end = self.pad(0, 0), self.pad(1, 0, pcbnew.B_Cu)
        self.track((0, 0), (1, 0))
        self.assertIsNone(distance(net_graph(self.board, 'DDR'), start, end))


if __name__ == '__main__':
    unittest.main()
