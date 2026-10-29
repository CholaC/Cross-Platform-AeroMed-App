"""Synthetic research experiment. No operational or causal inference."""
import sys,json
import numpy as np
from sklearn.model_selection import train_test_split, KFold, cross_val_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LinearRegression
from sklearn.tree import DecisionTreeRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.dummy import DummyRegressor
from sklearn.inspection import permutation_importance
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
n,seed=map(int,sys.argv[1:]); rng=np.random.default_rng(seed)
names=['distance_km','weather_severity','road_condition','team_availability','resource_availability','pending_requests']
X=np.column_stack([rng.uniform(20,500,n),rng.uniform(0,1,n),rng.uniform(0,1,n),rng.uniform(.3,1,n),rng.uniform(.3,1,n),rng.integers(1,35,n)])
# Outcome is deliberately generated from stated assumptions, not measured ZFDS records.
delay=0.07*X[:,0]+80*X[:,1]**2+45*(1-X[:,2])+65*(1-X[:,3])+55*(1-X[:,4])+1.1*X[:,5]+rng.normal(0,10,n)
y=np.clip(100-100*np.maximum(delay,0)/240,0,100)
train_x,test_x,train_y,test_y=train_test_split(X,y,test_size=.2,random_state=seed)
models={'mean_baseline':DummyRegressor(),'linear_regression':make_pipeline(StandardScaler(),LinearRegression()),'decision_tree':DecisionTreeRegressor(max_depth=6,min_samples_leaf=8,random_state=seed),'random_forest':RandomForestRegressor(n_estimators=100,max_depth=10,min_samples_leaf=3,random_state=seed,n_jobs=1)}
cv=KFold(5,shuffle=True,random_state=seed); scores={}
for name,model in models.items():
 vals=-cross_val_score(model,train_x,train_y,cv=cv,scoring='neg_mean_absolute_error')
 scores[name]={'validation_mae':float(vals.mean()),'validation_std':float(vals.std())}
best=min(scores,key=lambda k:scores[k]['validation_mae']); model=models[best].fit(train_x,train_y); pred=model.predict(test_x)
importance=permutation_importance(model,test_x,test_y,n_repeats=10,random_state=seed,scoring='neg_mean_absolute_error')
result={'synthetic':True,'samples':n,'seed':seed,'target':'Efficiency score = clipped 100 - 100 × simulated delay_minutes / 240','assumptions':'Delay = .07 distance + 80 weather² + 45(1-road condition) + 65(1-team availability) + 55(1-resource availability) + 1.1 pending requests + Normal(0,10).','split':'80% train with 5-fold validation; 20% untouched test. Winner selected using validation MAE only.','models':scores,'best_model':best,'test':{'mae':float(mean_absolute_error(test_y,pred)),'rmse':float(np.sqrt(mean_squared_error(test_y,pred))),'r2':float(r2_score(test_y,pred))},'factors':sorted([{'factor':name,'importance':float(value),'std':float(std)} for name,value,std in zip(names,importance.importances_mean,importance.importances_std)],key=lambda x:-x['importance']),'limitation':'Predictive importance reflects the synthetic generator. It is not evidence about real ZFDS operations or causation.'}
print(json.dumps(result))
