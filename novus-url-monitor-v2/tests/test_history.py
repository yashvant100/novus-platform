def test_history_limit():
    records=list(range(1,106)); newest=records[-100:]
    assert len(newest)==100 and newest[0]==6 and newest[-1]==105
