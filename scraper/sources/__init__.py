from .caixa import CaixaSource
from .mega_leiloes import MegaLeiloesSource
from .superbid import SoldSource, SuperbidSource
from .zuk import ZukSource

SOURCES = {
    "caixa": CaixaSource,
    "mega_leiloes": MegaLeiloesSource,
    "zuk": ZukSource,
    "superbid": SuperbidSource,
    "sold": SoldSource,
}
